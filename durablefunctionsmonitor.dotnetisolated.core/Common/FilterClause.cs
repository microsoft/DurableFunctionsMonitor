// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Reflection;
using System.Text.RegularExpressions;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    // A parsed $filter clause
    class FilterClause
    {
        public FilterClause(string filterString)
        {
            if (filterString == null)
            {
                filterString = string.Empty;
            }

            filterString = this.ExtractTimeRange(filterString);
            filterString = this.ExtractRuntimeStatuses(filterString);
            this.ExtractPredicate(filterString);
        }

        public Func<string, bool> Predicate { get; private set; }
        public string FieldName { get; private set; }

        public DateTime? TimeFrom { get; private set; }
        public DateTime? TimeTill { get; private set; }
        public string[] RuntimeStatuses { get; private set; }

        private string ExtractTimeRange(string filterClause)
        {
            this.TimeFrom = null;
            this.TimeTill = null;

            if (string.IsNullOrEmpty(filterClause))
            {
                return filterClause;
            }

            var match = TimeFromRegex.Match(filterClause);
            if (match.Success)
            {
                this.TimeFrom = DateTime.Parse(match.Groups[3].Value);
                filterClause = filterClause.Substring(0, match.Index) + filterClause.Substring(match.Index + match.Length);
            }

            match = TimeTillRegex.Match(filterClause);
            if (match.Success)
            {
                this.TimeTill = DateTime.Parse(match.Groups[2].Value);
                filterClause = filterClause.Substring(0, match.Index) + filterClause.Substring(match.Index + match.Length);
            }

            return filterClause;
        }

        private string ExtractRuntimeStatuses(string filterClause)
        {
            this.RuntimeStatuses = null;

            if (string.IsNullOrEmpty(filterClause))
            {
                return filterClause;
            }

            var match = RuntimeStatusRegex.Match(filterClause);
            if (match.Success)
            {
                this.RuntimeStatuses = match.Groups[2].Value
                    .Split(',').Where(s => !string.IsNullOrEmpty(s))
                    .Select(s => s.Trim(' ', '\'')).ToArray();

                filterClause = filterClause.Substring(0, match.Index) + filterClause.Substring(match.Index + match.Length);
            }

            return filterClause;
        }

        private void ExtractPredicate(string filterString)
        {
            // startswith(field-name, 'value') eq true|false
            var match = StartsWithRegex.Match(filterString);
            if (match.Success)
            {

                bool result = true;
                if (match.Groups.Count > 4)
                {
                    result = match.Groups[4].Value != "false";
                }
                string arg = match.Groups[2].Value;

                this.Predicate = (v) => v.StartsWith(arg) == result;
            }
            // contains(field-name, 'value') eq true|false
            else if ((match = ContainsRegex.Match(filterString)).Success)
            {
                bool result = true;
                if (match.Groups.Count > 4)
                {
                    result = match.Groups[4].Value != "false";
                }
                string arg = match.Groups[2].Value;

                this.Predicate = (v) => v.Contains(arg) == result;
            }
            // field-name eq|ne 'value'
            else if ((match = EqRegex.Match(filterString)).Success)
            {
                string value = match.Groups[3].Value;
                string op = match.Groups[2].Value;

                this.Predicate = (v) =>
                {
                    bool res = value == "null" ? string.IsNullOrEmpty(v) : v == value;
                    return op == "ne" ? !res : res;
                };
            }
            // field-name in ('value1','value2','value3')
            else if ((match = InRegex.Match(filterString)).Success)
            {
                string value = match.Groups[2].Value.Trim();

                string[] values;
                if (value.StartsWith("'"))
                {
                    values = LazyQuotesRegex.Matches(value)
                        .Select(m => m.Groups[1].Value)
                        .ToArray();
                }
                else
                {
                    values = match.Groups[2].Value
                        .Split(',').Where(s => !string.IsNullOrEmpty(s))
                        .Select(s => s.Trim(' ', '\''))
                        .ToArray();
                }

                if ((match.Groups.Count) > 4 && (match.Groups[4].Value == "false"))
                {
                    this.Predicate = (v) => !values.Contains(v);
                }
                else
                {
                    this.Predicate = (v) => values.Contains(v);
                }
            }

            if (this.Predicate != null)
            {
                this.FieldName = match.Groups[1].Value;
            }
        }

        private static readonly Regex StartsWithRegex = new Regex(@"startswith\s*\(\s*(\w+)\s*,\s*'([^']+)'\s*\)\s*(eq)?\s*(true|false)?", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex ContainsRegex = new Regex(@"contains\s*\(\s*(\w+)\s*,\s*'([^']+)'\s*\)\s*(eq)?\s*(true|false)?", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex EqRegex = new Regex(@"(\w+)\s+(eq|ne)\s*'([^']+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex InRegex = new Regex(@"(\w+)\s+in\s*\((.*)\)\s*(eq)?\s*(true|false)?", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex LazyQuotesRegex = new Regex(@"'(.*?)'", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static readonly Regex RuntimeStatusRegex = new Regex(@"\s*(and\s+)?runtimeStatus\s+in\s*\(([^\)]*)\)(\s*and)?\s*", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex TimeFromRegex = new Regex(@"\s*(and\s+)?(createdTime|timestamp)\s+ge\s+'([\d-:.T]{19,}Z)'(\s*and)?\s*", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex TimeTillRegex = new Regex(@"\s*(and\s+)?createdTime\s+le\s+'([\d-:.T]{19,}Z)'(\s*and)?\s*", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }

    static class FilterClauseExtensions
    {
        // Applies a filter to a collection of items
        internal static IEnumerable<T> ApplyFilter<T>(this IEnumerable<T> items, FilterClause filter)
        {
            if (string.IsNullOrEmpty(filter.FieldName))
            {
                // if field to be filtered is not specified, returning everything
                foreach (var orchestration in items)
                {
                    yield return orchestration;
                }
            }
            else
            {
                if (filter.Predicate == null)
                {
                    // if filter expression is invalid, returning nothing
                    yield break;
                }

                var propInfo = typeof(T).GetProperties()
                    .FirstOrDefault(p => p.Name.Equals(filter.FieldName, StringComparison.InvariantCultureIgnoreCase));

                if (propInfo == null)
                {
                    // if field name is invalid, returning nothing
                    yield break;
                }

                foreach (var item in items)
                {
                    if (filter.Predicate(item.GetPropertyValueAsString(propInfo)))
                    {
                        yield return item;
                    }
                }
            }
        }

        // Helper for formatting orchestration field values
        internal static string GetPropertyValueAsString<T>(this T orchestration, PropertyInfo propInfo)
        {
            object propValue = propInfo.GetValue(orchestration);

            if (propValue == null)
            {
                return string.Empty;
            }

            // Explicitly handling DateTime as 'yyyy-MM-ddTHH:mm:ssZ'
            if (propInfo.PropertyType == typeof(DateTime))
            {
                return ((DateTime)propValue).ToString(Globals.SerializerSettings.DateFormatString);
            }

            return propValue.ToString();
        }
    }
}