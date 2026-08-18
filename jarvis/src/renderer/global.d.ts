import type { JSX as ReactJSX } from 'react';
import type { JarvisApi } from '../shared/ipc.js';

declare global {
  /**
   * React 19 no longer publishes a global `JSX` namespace. The components in
   * this app annotate their return type as `JSX.Element`, so the namespace is
   * re-exported here once instead of importing it in every file.
   */
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementType = ReactJSX.ElementType;
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  }

  interface Window {
    jarvis: JarvisApi;
    /** Chromium's speech recognition, exposed under the vendor prefix. */
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }

  /**
   * Minimal shape of the Web Speech API we actually use. The DOM lib does not
   * ship these types, and the full interface is far larger than we need.
   */
  interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: { error: string; message?: string }) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
  }

  interface SpeechRecognitionEventLike {
    resultIndex: number;
    results: {
      length: number;
      item(index: number): { isFinal: boolean; 0: { transcript: string }; length: number };
      [index: number]: { isFinal: boolean; 0: { transcript: string }; length: number };
    };
  }
}

export {};
