import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  EXTERNAL_LINK_PREVIEW_NODE_NAME,
  normalizeExternalLinkPreviewAttributes,
  normalizeExternalLinkPreviewMetadataPatch,
} from "./attributes";
import type { ExternalLinkPreviewResolutionStatus, ExternalLinkPreviewResolver } from "./types";

interface ExternalLinkPreviewRequest {
  href: string;
  position: number;
  status: Exclude<ExternalLinkPreviewResolutionStatus, "idle">;
  token: number;
}

interface ExternalLinkPreviewResolverState {
  nextToken: number;
  requests: Map<number, ExternalLinkPreviewRequest>;
}

type ExternalLinkPreviewResolverMeta =
  | { type: "start"; href: string; position: number }
  | { type: "complete"; token: number }
  | { type: "error"; token: number };

export const externalLinkPreviewResolverPluginKey = new PluginKey<ExternalLinkPreviewResolverState>(
  "scribeExternalLinkPreviewResolver",
);

const isMatchingPreviewNode = (node: ProseMirrorNode | null | undefined, href: string) =>
  node?.type.name === EXTERNAL_LINK_PREVIEW_NODE_NAME && node.attrs.href === href;

const getRequestByToken = (state: ExternalLinkPreviewResolverState, token: number) =>
  Array.from(state.requests.values()).find((request) => request.token === token);

export const startExternalLinkPreviewResolution = (
  transaction: Transaction,
  position: number,
  href: string,
) => {
  transaction.setMeta(externalLinkPreviewResolverPluginKey, {
    type: "start",
    href,
    position,
  } satisfies ExternalLinkPreviewResolverMeta);

  return transaction;
};

export const getExternalLinkPreviewResolutionStatus = (
  state: EditorState,
  position: number,
): ExternalLinkPreviewResolutionStatus => {
  const pluginState = externalLinkPreviewResolverPluginKey.getState(state);

  if (!pluginState) {
    return "idle";
  }

  return (
    Array.from(pluginState.requests.values()).find((request) => request.position === position)
      ?.status ?? "idle"
  );
};

const applyResolverTransaction = (
  transaction: Transaction,
  previousState: ExternalLinkPreviewResolverState,
): ExternalLinkPreviewResolverState => {
  const requests = new Map<number, ExternalLinkPreviewRequest>();

  previousState.requests.forEach((request) => {
    const mapped = transaction.mapping.mapResult(request.position, 1);
    const node = transaction.doc.nodeAt(mapped.pos);

    if (!mapped.deleted && isMatchingPreviewNode(node, request.href)) {
      requests.set(request.token, { ...request, position: mapped.pos });
    }
  });

  const meta = transaction.getMeta(externalLinkPreviewResolverPluginKey) as
    | ExternalLinkPreviewResolverMeta
    | undefined;
  let nextToken = previousState.nextToken;

  if (!meta) {
    return { nextToken, requests };
  }

  if (meta.type === "start") {
    requests.forEach((request, token) => {
      if (request.position === meta.position) {
        requests.delete(token);
      }
    });

    if (isMatchingPreviewNode(transaction.doc.nodeAt(meta.position), meta.href)) {
      nextToken += 1;
      requests.set(nextToken, {
        href: meta.href,
        position: meta.position,
        status: "loading",
        token: nextToken,
      });
    }
  } else if (meta.type === "complete") {
    requests.delete(meta.token);
  } else {
    const request = getRequestByToken({ nextToken, requests }, meta.token);

    if (request) {
      requests.set(request.token, { ...request, status: "error" });
    }
  }

  return { nextToken, requests };
};

const dispatchResolverMeta = (view: EditorView, meta: ExternalLinkPreviewResolverMeta) => {
  if (view.isDestroyed) {
    return;
  }

  view.dispatch(
    view.state.tr
      .setMeta(externalLinkPreviewResolverPluginKey, meta)
      .setMeta("addToHistory", false),
  );
};

const applyResolvedMetadata = (
  view: EditorView,
  request: ExternalLinkPreviewRequest,
  metadata: Awaited<ReturnType<ExternalLinkPreviewResolver>>,
) => {
  if (view.isDestroyed) {
    return;
  }

  const pluginState = externalLinkPreviewResolverPluginKey.getState(view.state);
  const currentRequest = pluginState ? getRequestByToken(pluginState, request.token) : undefined;

  if (!currentRequest || currentRequest.status !== "loading" || !metadata) {
    if (currentRequest && !metadata) {
      dispatchResolverMeta(view, { type: "error", token: request.token });
    }
    return;
  }

  const node = view.state.doc.nodeAt(currentRequest.position);

  if (!isMatchingPreviewNode(node, currentRequest.href) || !node) {
    return;
  }

  const attributes = normalizeExternalLinkPreviewAttributes({
    ...node.attrs,
    ...normalizeExternalLinkPreviewMetadataPatch(metadata),
  });

  if (!attributes) {
    dispatchResolverMeta(view, { type: "error", token: request.token });
    return;
  }

  const transaction = view.state.tr
    .setNodeMarkup(currentRequest.position, undefined, attributes)
    .setMeta(externalLinkPreviewResolverPluginKey, {
      type: "complete",
      token: request.token,
    } satisfies ExternalLinkPreviewResolverMeta)
    .setMeta("addToHistory", false);

  view.dispatch(transaction);
};

export const createExternalLinkPreviewResolverPlugin = ({
  editor,
  resolve,
}: {
  editor: Editor;
  resolve?: ExternalLinkPreviewResolver;
}) => {
  const controllers = new Map<number, AbortController>();

  const reconcileRequests = (view: EditorView) => {
    const state = externalLinkPreviewResolverPluginKey.getState(view.state);
    const loadingTokens = new Set(
      Array.from(state?.requests.values() ?? [])
        .filter((request) => request.status === "loading")
        .map((request) => request.token),
    );

    controllers.forEach((controller, token) => {
      if (!loadingTokens.has(token)) {
        controller.abort();
        controllers.delete(token);
      }
    });

    if (!resolve || editor.isDestroyed || !state) {
      return;
    }

    state.requests.forEach((request) => {
      if (request.status !== "loading" || controllers.has(request.token)) {
        return;
      }

      const controller = new AbortController();

      controllers.set(request.token, controller);
      Promise.resolve()
        .then(() => resolve(request.href, { signal: controller.signal }))
        .then((metadata) => {
          if (!controller.signal.aborted) {
            applyResolvedMetadata(view, request, metadata);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            dispatchResolverMeta(view, { type: "error", token: request.token });
          }
        })
        .finally(() => {
          controllers.delete(request.token);
        });
    });
  };

  return new Plugin<ExternalLinkPreviewResolverState>({
    key: externalLinkPreviewResolverPluginKey,
    state: {
      init: () => ({ nextToken: 0, requests: new Map() }),
      apply: applyResolverTransaction,
    },
    view(view) {
      reconcileRequests(view);

      return {
        update: reconcileRequests,
        destroy() {
          controllers.forEach((controller) => controller.abort());
          controllers.clear();
        },
      };
    },
  });
};
