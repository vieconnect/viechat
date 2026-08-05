// ===== HÀM MỞ MODAL TỐI ƯU CHO CẢ DESKTOP VÀ MOBILE =====
        function openModalOptimized(modalId, options = {}) {
            const modalEl = document.getElementById(modalId);
            if (!modalEl) return null;
            
            closeAllModals();
            
            setTimeout(() => {
                const config = {
                    backdrop: 'static',
                    keyboard: true,
                    ...options
                };
                
                if (bootstrap.Modal.getInstance(modalEl)) {
                    bootstrap.Modal.getInstance(modalEl).dispose();
                }
                
                const modal = new bootstrap.Modal(modalEl, config);
                activeModalInstance = modal;
                
                modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
                    modalEl.removeEventListener('hidden.bs.modal', handleHidden);
                    if (activeModalInstance === modal) activeModalInstance = null;
                }, { once: true });
                
                modalEl.addEventListener('shown.bs.modal', function handleShown() {
                    modalEl.removeEventListener('shown.bs.modal', handleShown);
                }, { once: true });
                
                modal.show();
            }, 350);
        }

        // ===== HÀM ĐÓNG TẤT CẢ MODAL =====
        function closeAllModals() {
            if (activeModalInstance) {
                activeModalInstance.hide();
                activeModalInstance = null;
            }
            
            const modalElements = document.querySelectorAll('.modal.show');
            modalElements.forEach(el => {
                const modal = bootstrap.Modal.getInstance(el);
                if (modal) {
                    modal.hide();
                }
            });
            
            setTimeout(() => {
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(el => {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                });
                
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
            }, 400);
        }