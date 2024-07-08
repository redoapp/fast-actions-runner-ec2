import { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Create HTML from a React node.
 */
export function html(content: ReactNode) {
  return `<!DOCTYPE html>\n${renderToStaticMarkup(content)}`;
}
