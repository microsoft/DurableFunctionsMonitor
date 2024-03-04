// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using DurableFunctionsMonitor.DotNetIsolated;
using System;
using System.Linq;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class FilterClauseTests
    {
        [TestMethod]
        public void HandlesEmptyFilter()
        {
            // Act
            var result = new FilterClause(null);

            // Assert
            Assert.IsNull(result.TimeFrom);
            Assert.IsNull(result.TimeTill);
            Assert.IsNull(result.RuntimeStatuses);
            Assert.IsNull(result.FieldName);
            Assert.IsNull(result.Predicate);
        }

        [TestMethod]
        public void HandlesFullFilter()
        {
            // Arrange
            string filter = $" createdTime  ge '2018-06-16T15:56:07.000Z' and instanceId ne 'abcd'  and    createdTime le   '2021-11-03T01:02:03.000Z' and runtimeStatus in('Failed')";

            // Act
            var result = new FilterClause(filter);

            // Assert
            Assert.AreEqual(result.TimeFrom.Value.ToUniversalTime(), new DateTime(2018, 6, 16, 15, 56, 07, DateTimeKind.Utc));
            Assert.AreEqual(result.TimeTill.Value.ToUniversalTime(), new DateTime(2021, 11, 3, 1, 2, 3, DateTimeKind.Utc));
            Assert.AreEqual(result.FieldName, "instanceId");
            Assert.IsFalse(result.Predicate("abcd"));
            Assert.AreEqual(result.RuntimeStatuses.Length, 1);
            Assert.IsTrue(result.RuntimeStatuses.Contains("Failed"));
        }

        [TestMethod]
        public void HandlesPartialFilter()
        {
            // Arrange
            string filter = $"runtimeStatus in ( 'Failed'   ,  'Pending'   ) and createdTime le '2021-11-03T01:02:03.000Z'  ";

            // Act
            var result = new FilterClause(filter);

            // Assert
            Assert.IsNull(result.TimeFrom);
            Assert.AreEqual(result.TimeTill.Value.ToUniversalTime(), new DateTime(2021, 11, 3, 1, 2, 3, DateTimeKind.Utc));
            Assert.IsNull(result.FieldName);
            Assert.IsNull(result.Predicate);
            Assert.AreEqual(result.RuntimeStatuses.Length, 2);
            Assert.IsTrue(result.RuntimeStatuses.Contains("Failed"));
            Assert.IsTrue(result.RuntimeStatuses.Contains("Pending"));
        }

        [TestMethod]
        public void HandlesContains()
        {
            // Act
            var result = new FilterClause(" contains  ( input,   'abcd'   )    ");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("12abcd 34"));
            Assert.IsFalse(result.Predicate("1234"));
        }

        [TestMethod]
        public void HandlesNotContains()
        {
            // Act
            var result = new FilterClause("contains(input,'abcd') eq false");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("12345"));
            Assert.IsFalse(result.Predicate("123abcd45"));
        }

        [TestMethod]
        public void HandlesStartsWith()
        {
            // Act
            var result = new FilterClause("startsWith(input, 'abcd')");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("abcdef"));
            Assert.IsFalse(result.Predicate("fedcba"));
        }

        [TestMethod]
        public void HandlesNotStartsWith()
        {
            // Act
            var result = new FilterClause("startsWith(input, 'abcd') eq false");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("234567"));
            Assert.IsFalse(result.Predicate("abcd"));
        }

        [TestMethod]
        public void HandlesEq()
        {
            // Act
            var result = new FilterClause("  input   eq 'abcd'");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("abcd"));
            Assert.IsFalse(result.Predicate("1234"));
        }

        [TestMethod]
        public void HandlesNe()
        {
            // Act
            var result = new FilterClause("input ne 'abcd'");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate("dcba"));
            Assert.IsFalse(result.Predicate("abcd"));
        }

        [TestMethod]
        public void HandlesInWithQuotes()
        {
            // Act
            var result = new FilterClause("input in (')', 'a)bc', ',', '12,3', '(', '')");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate(")"));
            Assert.IsTrue(result.Predicate("a)bc"));
            Assert.IsTrue(result.Predicate(","));
            Assert.IsTrue(result.Predicate("12,3"));
            Assert.IsTrue(result.Predicate("("));
            Assert.IsTrue(result.Predicate(""));
            Assert.IsFalse(result.Predicate("54321"));
        }

        [TestMethod]
        public void HandlesInWithoutQuotes()
        {
            // Act
            var result = new FilterClause("input in (1,2.3,45)");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate(1.ToString()));
            Assert.IsTrue(result.Predicate(2.3.ToString()));
            Assert.IsTrue(result.Predicate(45.ToString()));
            Assert.IsFalse(result.Predicate("54321"));
        }

        [TestMethod]
        public void HandlesNotIn()
        {
            // Act
            var result = new FilterClause("input in ( 1 , 2  )  eq   false");

            // Assert
            Assert.AreEqual(result.FieldName, "input");
            Assert.IsTrue(result.Predicate(3.ToString()));
            Assert.IsFalse(result.Predicate(1.ToString()));
            Assert.IsFalse(result.Predicate(2.ToString()));
        }
    }
}