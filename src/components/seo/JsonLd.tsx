/**
 * Structured data.
 *
 * Rendered in the body rather than the head: search engines read JSON-LD
 * anywhere in the document, and the App Router has no head escape hatch.
 * The `<` escape prevents a string in the data from closing the script tag.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
