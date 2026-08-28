export type ServerlessRequest<TBody = unknown, TParams extends Record<string, string> = Record<string, string>> = {
  body?: TBody;
  params: TParams;
  query?: Record<string, string>;
};

export type ServerlessResponse<TBody = unknown> = {
  statusCode: number;
  headers?: Record<string, string>;
  body: TBody;
};
