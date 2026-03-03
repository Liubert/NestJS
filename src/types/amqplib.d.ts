declare module 'amqplib' {
  import type { EventEmitter } from 'events';

  export type ConsumeMessage = {
    content: Buffer;
    properties: {
      contentType?: string;
      messageId?: string;
      correlationId?: string;
      [key: string]: unknown;
    };
    fields: {
      deliveryTag: number;
      redelivered: boolean;
      exchange: string;
      routingKey: string;
      [key: string]: unknown;
    };
  };

  export interface Channel extends EventEmitter {
    close(): Promise<void>;
    prefetch(count: number, global?: boolean): Promise<unknown>;
    consume(
      queue: string,
      onMessage: (msg: ConsumeMessage | null) => void,
      options?: { noAck?: boolean },
    ): Promise<{ consumerTag: string }>;
    cancel(consumerTag: string): Promise<unknown>;
    ack(message: ConsumeMessage): void;
  }

  export interface ConfirmChannel extends Channel {
    assertExchange(
      exchange: string,
      type: string,
      options?: { durable?: boolean },
    ): Promise<unknown>;
    assertQueue(
      queue: string,
      options?: { durable?: boolean; arguments?: Record<string, unknown> },
    ): Promise<unknown>;
    bindQueue(
      queue: string,
      exchange: string,
      routingKey: string,
    ): Promise<unknown>;
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: Record<string, unknown>,
    ): boolean;
    waitForConfirms(): Promise<void>;
  }

  export interface ChannelModel extends EventEmitter {
    close(): Promise<void>;
    createChannel(): Promise<Channel>;
    createConfirmChannel(): Promise<ConfirmChannel>;
  }

  export function connect(
    url: string,
    socketOptions?: unknown,
  ): Promise<ChannelModel>;
}
