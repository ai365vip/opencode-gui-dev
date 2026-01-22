import { createDecorator } from '../../di/instantiation';
import type { ITransport } from '../transport';
import type { WebViewToExtensionMessage } from '../../shared/messages';

export const IOpencodeAgentService = createDecorator<IOpencodeAgentService>('opencodeAgentService');

export interface IOpencodeAgentService {
  readonly _serviceBrand: undefined;

  setTransport(transport: ITransport): void;
  start(): void;
  fromClient(message: WebViewToExtensionMessage): Promise<void>;

  revertLastChange(): Promise<boolean>;
  openOhMyConfig(): Promise<void>;
}

export { OpencodeAgentService } from './OpencodeAgentServiceImpl';
