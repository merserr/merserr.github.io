const DB_NAME = 'EquipmentDB';
const DB_VERSION = 1;
const STORE_NAME = 'items';

let db = null;

// 1. Инициализация IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('ort', 'ort', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

// 2. Парсер текста (\t или ,)
function parseTextData(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(delimiter);
        const obj = {};

        headers.forEach((header, index) => {
            obj[header] = values[index] ? values[index].trim() : '';
        });

        result.push(obj);
    }

    return result;
}

// 3. Загрузка мест (ort) в выпадающий список
async function loadOrtCategories() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        const items = request.result;
        const orts = [...new Set(items.map(i => i.ort).filter(Boolean))].sort();

        const select = document.getElementById('ort-select');
        select.innerHTML = '<option value="">-- alle Orte --</option>';

        orts.forEach(ort => {
            const option = document.createElement('option');
            option.value = ort;
            option.textContent = ort;
            select.appendChild(option);
        });
    };
}

// 4. Отрисовка таблицы с фильтрацией по Ort и поисковому запросу
async function renderItems() {
    const selectedOrt = document.getElementById('ort-select').value;
    const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();

    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const tbody = document.getElementById('equipment-tbody');
    tbody.innerHTML = '';

    const request = store.getAll();

    request.onsuccess = () => {
        let items = request.result;

        // Фильтрация по выбранной категории Ort
        if (selectedOrt) {
            items = items.filter(item => item.ort === selectedOrt);
        }

        // Поиск по полям Sicherung, Systemnummer и Name
        if (searchQuery) {
            items = items.filter(item => {
                const sicherung = (item.sicherung || '').toLowerCase();
                const systemnummer = (item.systemnummer || '').toLowerCase();
                const name = (item.name || '').toLowerCase();

                return sicherung.includes(searchQuery) || 
                       systemnummer.includes(searchQuery) || 
                       name.includes(searchQuery);
            });
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Keine Datensätze gefunden</td></tr>';
            return;
        }

		items.forEach(item => {
			const tr = document.createElement('tr');
			tr.className = 'clickable-row';
			tr.innerHTML = `
				<td class="col-num">${item.nummer || '-'}</td>
				<td class="col-sich">${item.sicherung || '-'}</td>
				<td class="col-sys">${item.systemnummer || '-'}</td>
				<td class="col-name">${item.name || '-'}</td>
				<td class="col-ort">${item.ort || '-'}</td>
			`;
			tr.addEventListener('click', () => openModal(item));
			tbody.appendChild(tr);
		});
    };
}

// 5. Показ деталей объекта в модальном окне
function openModal(item) {
    const detailsContainer = document.getElementById('modal-details');
    detailsContainer.innerHTML = '';

    document.getElementById('modal-title').textContent = item.name || 'Stichdetails';

    Object.keys(item).forEach(key => {
        if (key === 'id') return;
        const val = item[key];

        // Пропускаем пустые значения
        if (val !== undefined && val !== null && val.toString().trim() !== '' && val !== '-') {
            const div = document.createElement('div');
            div.className = 'info-group';
            div.innerHTML = `<label>${key}</label><span>${val}</span>`;
            detailsContainer.appendChild(div);
        }
    });

    // Кнопка поиска аналогичных Systemnummer
    if (item.systemnummer && item.systemnummer.trim() !== '') {
        const btnSearch = document.createElement('button');
        btnSearch.className = 'btn-action btn-search';
        btnSearch.style.marginTop = '15px';
        btnSearch.style.width = '100%';
        btnSearch.textContent = `🔍 Suchen Artikel mit Systemnummer: "${item.systemnummer}"`;
        
        btnSearch.addEventListener('click', () => {
            closeModal();
            document.getElementById('ort-select').value = '';
            
            // Открываем поле поиска и вставляем туда systemnummer
            const searchContainer = document.getElementById('search-container');
            const searchInput = document.getElementById('search-input');
            searchContainer.style.display = 'block';
            searchInput.value = item.systemnummer;

            renderItems();
        });

        detailsContainer.appendChild(btnSearch);
    }

    document.getElementById('item-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('item-modal').style.display = 'none';
}

// 6. Обработка файла
document.getElementById('file-input').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const textContent = e.target.result;
            const parsedItems = parseTextData(textContent);

            if (parsedItems.length === 0) {
                alert('Fehler beim Lesen der Daten aus der Datei.');
                return;
            }

            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            await store.clear();
            parsedItems.forEach(item => store.add(item));

            tx.oncomplete = async () => {
                alert('Die Daten wurden erfolgreich importiert!');
                await loadOrtCategories();
                await renderItems();
            };
        } catch (err) {
            alert('Fehler beim Parsen der Datei.');
            console.error(err);
        }
    };

    reader.readAsText(file, 'UTF-8');
});

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    await loadOrtCategories();
    await renderItems();

    // Переключение видимости поля поиска по кнопке "Искать"
    document.getElementById('toggle-search-btn').addEventListener('click', () => {
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

    // Слушатели фильтра и поиска
    document.getElementById('ort-select').addEventListener('change', renderItems);
    document.getElementById('search-input').addEventListener('input', renderItems);
});
