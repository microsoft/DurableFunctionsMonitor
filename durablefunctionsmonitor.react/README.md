# DurableFunctionsMonitor.React

Web UI for DurableFunctionsMonitor.
React+MobX+TypeScript+Material UI.   

## How to compile and run locally

* [Run the backend locally](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend#how-to-run-locally) and make sure it runs under http://localhost:7072 (by opening it with your browser).
* Create a `.env.development.local` file with the following line in it:
  ```
  REACT_APP_BACKEND_BASE_URI=http://localhost:7072
  ```
* Run `npm install`
* Run `npm run start`. This should start the development server at http://localhost:3000 with UI sources running under it. This UI will communicate with the backend running at http://localhost:7072.

## How to build

A custom build command is included - `npm run build-and-copy`. This command will build the project and then copy the resulting artifacts into [durablefunctionsmonitor.dotnetbackend\DfmStatics](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend/DfmStatics) folder.
