import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}

  observe() {}

  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});

Object.defineProperty(window, "scrollBy", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

const createRect = () => new DOMRect(0, 0, 120, 24);

Object.defineProperties(Range.prototype, {
  getBoundingClientRect: {
    configurable: true,
    value: createRect,
  },
  getClientRects: {
    configurable: true,
    value: () => [createRect()],
  },
});
