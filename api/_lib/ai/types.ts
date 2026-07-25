/**
 * AIプロバイダの共通インターフェース。
 * 共通化するのはストリーミングでのテキスト生成のみ。プロンプトキャッシュ等の
 * プロバイダ固有の最適化機能は各実装内部で任意に使ってよく、ここには持ち出さない。
 */

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  /** systemPrompt + messages からテキストをストリーミング生成する。 */
  streamText(params: {
    systemPrompt: string;
    messages: AiMessage[];
  }): AsyncIterable<string>;
}

/** 各プロバイダ実装が上流エラーを正規化して投げるための共通エラー型。 */
export class AiProviderError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
