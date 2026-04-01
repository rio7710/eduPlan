from __future__ import annotations


def build_coverage_report(layout_payload: dict, page_docs: list[str]) -> dict:
    page_results: list[dict] = []
    missing_pages: list[int] = []
    missing_blocks = 0
    boxed_missing_blocks = 0

    for page_data, page_markdown in zip(layout_payload.get("pages", []), page_docs):
        missing_previews: list[dict] = []
        for block in page_data.get("blocks", []):
            if block.get("type") != "text":
                continue
            preview = str(block.get("preview", "")).strip()
            if len(preview) < 4:
                continue
            if preview in page_markdown:
                continue
            missing_previews.append({
                "blockId": block.get("blockId"),
                "preview": preview[:80],
                "containerIds": block.get("containerIds", []),
            })

        if missing_previews:
            missing_pages.append(int(page_data.get("page", 0)))
            missing_blocks += len(missing_previews)
            boxed_missing_blocks += sum(1 for item in missing_previews if item.get("containerIds"))

        page_results.append({
            "page": int(page_data.get("page", 0)),
            "blockCount": int(page_data.get("blockCount", 0)),
            "missingTextBlockCount": len(missing_previews),
            "missingTextBlocks": missing_previews[:10],
        })

    return {
        "missingPageCount": len(missing_pages),
        "missingPages": missing_pages,
        "missingTextBlocks": missing_blocks,
        "missingBoxedTextBlocks": boxed_missing_blocks,
        "pageResults": page_results,
    }
