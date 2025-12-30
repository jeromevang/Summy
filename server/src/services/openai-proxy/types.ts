export interface ProxyRequest extends Request {
  requestBody: any;
  sessionId: string;
  isStreaming: boolean;
}

export interface ProxyResponse {
  finalResponse: any;
  toolExecutions: any[];
  iterations: number;
}
