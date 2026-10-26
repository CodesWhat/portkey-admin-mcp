import { applyMdxPreset, defineConfig, defineDocs } from "fumadocs-mdx/config";
// The site has no search index, and the structure plugin's stringifier recurses
// forever on any bold or italic text, which the manual is full of.
export const docs = defineDocs({
  dir: "content/docs",
  docs: { mdxOptions: applyMdxPreset({ remarkStructureOptions: false }) },
});
export default defineConfig();
