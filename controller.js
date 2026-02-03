document.addEventListener('DOMContentLoaded', function() {
    const modalOverlay = document.getElementById('modalOverlay');
    const mainButtons = document.querySelectorAll('.main-btn');
    const closeButtons = document.querySelectorAll('.close-btn');
    const modals = document.querySelectorAll('.modal');

    mainButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modalType = this.getAttribute('data-modal');
            const targetModal = document.getElementById(modalType + 'Modal');

            modals.forEach(modal => {
                modal.style.display = 'none';
            });

            targetModal.style.display = 'flex';
            modalOverlay.classList.add('active');

            document.body.style.overflow = 'hidden';

            if (modalType === 'projects') {
                initializeCarousel();
            }
        });
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            closeModal();
        });
    });

    modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });

    function closeModal() {
        modalOverlay.classList.remove('active');
        document.body.style.overflow = '';

        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }

    function initializeCarousel() {
        const track = document.querySelector('.carousel-track');
        const items = document.querySelectorAll('.project-item');
        const prevBtn = document.querySelector('.carousel-btn.prev');
        const nextBtn = document.querySelector('.carousel-btn.next');

        if (!track || !items.length || !prevBtn || !nextBtn) return;

        let index = 0;

        function updateCarousel() {
            track.style.transform = `translateX(-${index * 100}%)`;
        }

        const handleNext = () => {
            index = (index + 1) % items.length;
            updateCarousel();
        };

        const handlePrev = () => {
            index = (index - 1 + items.length) % items.length;
            updateCarousel();
        };

        nextBtn.addEventListener('click', handleNext);
        prevBtn.addEventListener('click', handlePrev);
    }
});
