# PPT Clipboard Formats Summary

## 공통 포맷

PowerPoint에서 텍스트 상자 복사 시 아래 포맷이 확인되었다.

- `Preferred DropEffect`
- `InShellDragLoop`
- `Object Descriptor`
- `PowerPoint 12.0 Internal Theme`
- `PowerPoint 12.0 Internal Color Scheme`
- `PowerPoint 12.0 Internal Shapes`
- `Art::GVML ClipFormat`
- `image/svg+xml`
- `PNG`
- `JFIF`
- `GIF`
- `System.Drawing.Bitmap`
- `Bitmap`
- `EnhancedMetafile`
- `MetaFilePict`

## 텍스트 포맷

- `TEXT`: 없음
- `HTML`: 없음
- `RTF`: 없음

즉 PowerPoint 텍스트 상자 복사는 일반 텍스트 기반이 아니라 오브젝트 기반 클립보드다.

## 2개 텍스트 박스 복사 시

- `Art::GVML ClipFormat`: `4302 bytes`
- `image/svg+xml`: `984 bytes`

SVG에는 텍스트 노드가 여러 개 들어 있었다.

## 1개처럼 보이는 복사 시

- `Art::GVML ClipFormat`: `4252 bytes`
- `image/svg+xml`: `347 bytes`

분석 결과 `drawing1.xml` 안의 `<a:sp>` 개수는 `2개`였다.

## 2개 복사 + 한 개 폰트 변경 시

- `Art::GVML ClipFormat`: `4514 bytes`
- `drawing1.xml` 안의 `<a:sp>` 개수: `2개`

확인된 차이:

- 첫 번째 텍스트 박스는 `G마켓 산스 Bold`
- 두 번째 텍스트 박스는 `Arial`

즉 폰트 정보는 shape 내부 paragraph/run 수준의 `<a:rPr>`에 별도로 기록된다.

## 핵심 해석

- PowerPoint는 클립보드에 `lockedCanvas + shape(<a:sp>) 묶음`을 넣는다.
- 줄바꿈 분리 붙여넣기를 흉내내려면 결국 이 구조를 생성해야 한다.
