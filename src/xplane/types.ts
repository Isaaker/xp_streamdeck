/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

export type DataRefValue = number | string | number[] | boolean;

export type DataRefValueType = "int" | "float" | "double" | "int_array" | "float_array" | "data";

export interface DataRefMeta {
	id: number;
	name: string;
	value_type: DataRefValueType;
	is_writable?: boolean;
}

export interface CommandMeta {
	id: number;
	name: string;
	description?: string;
}

export interface RestListResponse<T> {
	data?: T[];
}

export interface RestValueResponse<T> {
	data?: T;
}

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

export interface ReconnectOptions {
	initialMs: number;
	maxMs: number;
}

export interface XPlaneLogger {
	debug?(msg: string, ...args: unknown[]): void;
	info(msg: string, ...args: unknown[]): void;
	warn(msg: string, ...args: unknown[]): void;
	error(msg: string, ...args: unknown[]): void;
}

export interface XPlaneClientOptions {
	host?: string;
	port?: number;
	apiVersion?: string;
	reconnect?: ReconnectOptions;
	logger?: XPlaneLogger;
}

export interface SubscriptionHandle {
	readonly name: string;
	readonly id: number;
	readonly disposed: boolean;
}

export type DataRefCallback = (value: DataRefValue) => void;

export interface WsRequestEnvelope {
	req_id: number;
	type: string;
	params?: Record<string, unknown>;
}

export interface WsResultMessage {
	req_id: number;
	type: "result";
	success: boolean;
	error_code?: string;
	error_message?: string;
}

export interface WsDataRefUpdateMessage {
	type: "dataref_update_values";
	data: Record<string, DataRefValue>;
}

export type WsServerMessage =
	| WsResultMessage
	| WsDataRefUpdateMessage
	| { type: string; [k: string]: unknown };
