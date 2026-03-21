from __future__ import annotations

import argparse
from pathlib import Path

import fitz


def resolve_pdf_inputs(inputs: list[Path]) -> list[Path]:
    pdf_files: list[Path] = []

    for input_path in inputs:
        resolved = input_path.resolve()
        if resolved.is_dir():
            pdf_files.extend(sorted(resolved.glob("*.pdf")))
        elif resolved.exists() and resolved.suffix.lower() == ".pdf":
            pdf_files.append(resolved)

    unique_files: list[Path] = []
    seen: set[Path] = set()
    for pdf_file in pdf_files:
        if pdf_file not in seen:
            seen.add(pdf_file)
            unique_files.append(pdf_file)

    return unique_files


def save_page_images(doc: fitz.Document, page: fitz.Page, image_dir: Path, pdf_stem: str) -> list[str]:
    image_dir.mkdir(parents=True, exist_ok=True)
    saved_files: list[str] = []

    for image_index, img in enumerate(page.get_images(full=True), start=1):
        xref = img[0]
        extracted = doc.extract_image(xref)
        ext = extracted.get("ext", "png")
        filename = f"{pdf_stem}_{page.number + 1:03d}_{image_index:02d}.{ext}"
        output_path = image_dir / filename
        output_path.write_bytes(extracted["image"])
        saved_files.append(filename)

    return saved_files


def extract_text_from_block(block: dict) -> str:
    lines: list[str] = []
    for line in block.get("lines", []):
        spans = [span.get("text", "") for span in line.get("spans", [])]
        text = "".join(spans).strip()
        if text:
            lines.append(text)
    return "\n".join(lines).strip()


def extract_page_content(page: fitz.Page, image_labels: list[str] | None = None) -> str:
    blocks = page.get_text("dict").get("blocks", [])
    parts: list[str] = []
    image_index = 0

    for block in blocks:
        block_type = block.get("type")

        if block_type == 0:
            text = extract_text_from_block(block)
            if text:
                parts.append(text)
        elif block_type == 1:
            image_index += 1
            if image_labels and image_index <= len(image_labels):
                parts.append(f"[이미지 {image_index}: image/{image_labels[image_index - 1]}]")
            else:
                parts.append(f"[이미지 {image_index}]")

    content = "\n\n".join(parts).strip()
    if not content:
        return "[텍스트를 추출하지 못했습니다. 스캔 PDF라면 OCR이 필요합니다.]"

    return content


def extract_page_markdown(
    page: fitz.Page, page_number: int, source_name: str, image_labels: list[str] | None = None
) -> str:
    content = extract_page_content(page, image_labels)

    return "\n".join(
        [
            f"# Page {page_number:03d}",
            "",
            f"> source: {source_name}",
            "",
            content,
            "",
        ]
    )


def write_merged_markdown(output_dir: Path, pdf_stem: str, page_docs: list[str], source_name: str) -> None:
    merged_parts = [
        f"# {pdf_stem}",
        "",
        f"> source: {source_name}",
        "",
    ]

    for index, page_doc in enumerate(page_docs):
        if index > 0:
            merged_parts.extend(["", "---", ""])
        merged_parts.append(page_doc)

    merged_parts.append("")
    merged_path = output_dir / f"{pdf_stem}.md"
    merged_path.write_text("\n".join(merged_parts), encoding="utf-8")
    print(f"written: {merged_path}")


def convert_pdf_to_markdown_pages(
    pdf_path: Path, output_dir: Path, extract_images: bool, write_page_files: bool
) -> tuple[int, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    image_dir = output_dir / "image"
    page_docs: list[str] = []

    with fitz.open(pdf_path) as doc:
        total_pages = len(doc)
        for index, page in enumerate(doc, start=1):
            image_labels = save_page_images(doc, page, image_dir, pdf_path.stem) if extract_images else []
            markdown = extract_page_markdown(page, index, pdf_path.name, image_labels)
            page_docs.append(markdown)
            if write_page_files:
                output_path = output_dir / f"{pdf_path.stem}_{index:03d}.md"
                output_path.write_text(markdown, encoding="utf-8")
                print(f"written: {output_path}")

    write_merged_markdown(output_dir, pdf_path.stem, page_docs, pdf_path.name)
    return total_pages, len(page_docs)


def print_summary(results: list[tuple[str, int, int]]) -> None:
    print("\nsummary:")
    for pdf_name, total_pages, merged_pages in results:
        status = "OK" if total_pages == merged_pages else "MISMATCH"
        print(f"{status} | {pdf_name} | total={total_pages} merged={merged_pages}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert each PDF page into a separate Markdown file."
    )
    parser.add_argument("pdf", nargs="+", type=Path, help="Input PDF path or folder")
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        help="Output directory. Defaults to ./mldoc/<pdf-name>/ or ./mldoc for batch mode.",
    )
    parser.add_argument(
        "--extract-images",
        action="store_true",
        help="Extract images into an image/ folder and link them in Markdown labels.",
    )
    parser.add_argument(
        "--merged-only",
        action="store_true",
        help="Only create the merged Markdown file, not per-page Markdown files.",
    )
    args = parser.parse_args()

    pdf_files = resolve_pdf_inputs(args.pdf)
    if not pdf_files:
        raise FileNotFoundError("No PDF files found in the given input.")

    base_output_dir = args.output_dir.resolve() if args.output_dir else Path.cwd() / "mldoc"
    results: list[tuple[str, int, int]] = []

    for pdf_path in pdf_files:
        output_dir = base_output_dir / pdf_path.stem if len(pdf_files) > 1 else (
            base_output_dir if args.output_dir else base_output_dir / pdf_path.stem
        )
        total_pages, merged_pages = convert_pdf_to_markdown_pages(
            pdf_path,
            output_dir.resolve(),
            args.extract_images,
            write_page_files=not args.merged_only,
        )
        results.append((pdf_path.name, total_pages, merged_pages))

    print_summary(results)


if __name__ == "__main__":
    main()
