document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadOrtCategories();
        await renderItems();
    } catch (err) {
        console.error('Initialisierungsfehler:', err);
    }

    const toggleBtn = document.getElementById('toggle-search-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const searchContainer = document.getElementById('search-container');
            const searchInput = document.getElementById('search-input');

            if (searchContainer.style.display === 'block') {
                searchContainer.style.display = 'none';
                searchInput.value = '';
                renderItems();
            } else {
                searchContainer.style.display = 'block';
                searchInput.focus();
            }
        });
    }

    const ortSelect = document.getElementById('ort-select');
    if (ortSelect) ortSelect.addEventListener('change', renderItems);

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', renderItems);
});
