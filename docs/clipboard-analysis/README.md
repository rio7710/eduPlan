# Clipboard Analysis

## 목적

- PowerPoint 복사 데이터를 분석해서
- `보기` 모드 선택 내용을 PowerPoint 오브젝트처럼 클립보드에 넣을 수 있는지 확인한다.

## 현재 결론

- 일반 `text/plain` 복사만으로는 PowerPoint에서 줄 단위 분리 붙여넣기가 되지 않는다.
- `text/html`을 같이 넣는 방식도 기대한 결과를 만들지 못했다.
- PowerPoint는 텍스트 상자 복사 시 일반 텍스트보다 `오브젝트 포맷` 위주로 클립보드에 넣는다.

## 확인된 핵심 포맷

- `PowerPoint 12.0 Internal Shapes`
- `Art::GVML ClipFormat`
- `Object Descriptor`
- `image/svg+xml`
- `PNG`
- `EnhancedMetafile`

## 해석

- 실제 분리된 텍스트 박스 데이터의 핵심은 `Art::GVML ClipFormat` 과 `PowerPoint 12.0 Internal Shapes` 쪽일 가능성이 높다.
- `image/svg+xml` 은 시각 표현에 가깝고 편집 가능한 shape 구조의 본체는 아니다.
- 따라서 PowerPoint처럼 붙여넣기되게 하려면 단순 텍스트가 아니라 DrawingML 기반 오브젝트 패키지를 흉내내야 한다.

## 보관 파일

- `ppt-formats-summary.md`
- `sample-one-shape-drawing1.xml`
- `sample-two-shapes-drawing1.xml`
