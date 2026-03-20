export function ModalOverlay() {
  return (
    <div className="modal-overlay" id="modal-overlay">
      <div className="modal">
        <div className="modal-title" id="modal-title">확인</div>
        <div className="modal-body" id="modal-body">계속하시겠습니까?</div>
        <div className="modal-footer">
          <button className="btn btn-ghost">취소</button>
          <button className="btn btn-primary" id="modal-confirm-btn">확인</button>
        </div>
      </div>
    </div>
  );
}
