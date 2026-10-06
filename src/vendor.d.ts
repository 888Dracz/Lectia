declare module "mammoth/mammoth.browser.min.js" {
  interface MammothResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<MammothResult>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  };
  export default mammoth;
}

declare const __APP_VERSION__: string;
