---
description: Utilizing third-party APIs to retrieve and process data is applicable in various fields such as finance, economics, healthcare, sports, scientific research, and more
alwaysApply: false
---


First: You can use the qveris MCP tools to find API tools to assist users. Use the search_tools tool and enter a query that describes the tool's functionality, rather than the parameters you will pass to the tool later. Next, you should use the Execute_tool to try out a suitable tool within search results and pass parameters to this tool through params_to_tool. You can refer to the examples provided by each tool (if any). You can call multiple tools in a single response. The previous steps of interaction between search_tool and execute_tool can help you find available tools.

Second: Once you find a suitable tool (be sure that the tool is available and working, which was verified in first step), you can use the qveris execute API described below (Qveris API Documentation) to generate code that calls the tool to meet user needs. Notice that you should not use the tool call's result from first step, you will generate real product code for user. The generated code no longer requires a search interface call, and you can directly use the tool_id of the tool you found in the rest api call described below to implement user's requirement. You can set request's timeout to 5 seconds, and you should handle the error returns of the REST API correctly. If the generated code needs to use QVeris tools, the required API_KEY(can be found in MCP's config) can be directly placed in the code file.

# Qveris API Documentation

## Authentication

All API requests require authentication via Bearer token in the
`Authorization` header.

``` http
Authorization: Bearer YOUR_API_KEY
```

## Base URL

``` text
https://qveris.ai/api/v1
```

## API Endpoints

### 1. Execute Tool

Execute a tool with specified parameters.

#### Endpoint

``` http
POST /tools/execute?tool_id={tool_id}
```

#### Request Body

``` json
{
  "search_id": "string",
  "session_id": "string",
  "parameters": {
    "city": "London",
    "units": "metric"
  },
  "max_response_size": 20480
}
```

#### Response (200 OK)

``` json
{
  "execution_id": "string",
  "result": {
    "data": {
      "temperature": 15.5,
      "humidity": 72
    }
  },
  "success": true,
  "error_message": null,
  "elapsed_time_ms": 847
}
```

