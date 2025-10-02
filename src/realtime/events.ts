// src/realtime/events.ts
export enum RtEvent {
    Connected = 'rt:connected',
    OrderStatus = 'order:status',
    Notification = 'notification:new',
    Ping = 'rt:ping',
    Pong = 'rt:pong',
}
