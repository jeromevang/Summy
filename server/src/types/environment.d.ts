declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    RAG_SERVER_URL?: string;
    // Add other environment variables used in your project here
    // For example:
    // API_KEY?: string;
    // DB_HOST?: string;
  }
}
