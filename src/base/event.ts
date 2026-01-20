//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { diffSets } from './collections';
import { onUnexpectedError } from './errors';
import { createSingleCallFunction } from './functional';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from './lifecycle';
import { LinkedList } from './linkedList';

/**
 * An event with zero or one parameters that can be subscribed to. The event is a function itself.
 */
export interface Event<T> {
	(listener: (e: T) => unknown, thisArgs?: any, disposables?: IDisposable[] | DisposableStore): IDisposable;
}