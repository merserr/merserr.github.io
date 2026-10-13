const DB_NAME = 'EquipmentDB';
const DB_VERSION = 1;
const STORE_NAME = 'items';

let db = null;
let currentEditingId = null;
let originalHeaders = [];

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

function parseTextData(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    originalHeaders = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

    const result = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(delimiter);
        const obj = {};

        originalHeaders.forEach((header, index) => {
            obj[header] = values[index] ? values[index].trim() : '';
        });

        result.push(obj);
    }

    return result;
}

async function loadOrtCategories() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        const items = request.result;
        const orts = [...new Set(items.map(i => i.ort).filter(Boolean))].sort();

        const select = document.getElementById('ort-select');
        select.innerHTML = '<option value="">-- Alle Orte (Ort) --</option>';

        orts.forEach(ort => {
            const option = document.createElement('option');
            option.value = ort;
            option.textContent = ort;
            select.appendChild(option);
        });
    };
}

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

        if (selectedOrt) {
            items = items.filter(item => item.ort === selectedOrt);
        }

        if (searchQuery) {
            items = items.filter(item => {
                const beschriftung = (item.beschriftung || '').toLowerCase();
                const systemnummer = (item.systemnummer || '').toLowerCase();
                const name = (item.name || '').toLowerCase();

                return beschriftung.includes(searchQuery) || 
                       systemnummer.includes(searchQuery) || 
                       name.includes(searchQuery);
            });
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Keine Einträge gefunden</td></tr>';
            return;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            tr.innerHTML = `
                <td class="col-num">${item.nummer || '-'}</td>
                <td class="col-sich">${item.beschriftung || '-'}</td>
                <td class="col-sys">${item.systemnummer || '-'}</td>
                <td class="col-name">${item.name || '-'}</td>
                <td class="col-ort">${item.ort || '-'}</td>
            `;
            tr.addEventListener('click', () => openModal(item));
            tbody.appendChild(tr);
        });
    };
}

let isEditMode = false; // Флаг текущего режима (просмотр или редактирование)
let cachedItem = null;  // Кэш текущего открытого объекта

function openModal(item) {
    currentEditingId = item.id;
    cachedItem = item;
    isEditMode = false; // Всегда открываем в режиме просмотра

    renderModalContent();
    document.getElementById('item-modal').style.display = 'flex';
}

// Отрисовка содержимого модального окна в зависимости от режима
function renderModalContent() {
    const item = cachedItem;
    const detailsContainer = document.getElementById('modal-details');
    detailsContainer.innerHTML = '';

    const existingSearchBtn = document.getElementById('modal-sys-search-btn');
    if (existingSearchBtn) existingSearchBtn.remove();

    document.getElementById('modal-title').textContent = isEditMode 
        ? `Bearbeiten: ${item.name || 'Objekt'}` 
        : (item.name || 'Details');

    const keys = originalHeaders.length > 0 ? originalHeaders : Object.keys(item).filter(k => k !== 'id');

    keys.forEach(key => {
        const val = item[key] !== undefined ? item[key] : '';
        const isEmpty = val.toString().trim() === '' || val === '-';

        // В режиме просмотра пропускаем пустые поля
        if (!isEditMode && isEmpty) return;

        const div = document.createElement('div');
        div.className = 'info-group';
        div.innerHTML = `<label>${key}</label>`;

        if (isEditMode) {
            // РЕЖИМ РЕДАКТИРОВАНИЯ: показываем поля ввода (<input> или <textarea>)
            const isLongField = ['kommentar', 'name', 'zusatzt'].includes(key.toLowerCase()) || val.length > 30;

            let inputElement;
            if (isLongField) {
                inputElement = document.createElement('textarea');
                inputElement.value = val;
                inputElement.setAttribute('data-key', key);
                
                setTimeout(() => {
                    inputElement.style.height = 'auto';
                    inputElement.style.height = (inputElement.scrollHeight + 4) + 'px';
                }, 0);

                inputElement.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = (this.scrollHeight + 4) + 'px';
                });
            } else {
                inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.value = val;
                inputElement.setAttribute('data-key', key);
            }
            div.appendChild(inputElement);
        } else {
            // РЕЖИМ ПРОСМОТРА: выводим только текст
            const span = document.createElement('span');
            span.className = 'info-value-view';
            span.textContent = val;
            div.appendChild(span);
        }

        detailsContainer.appendChild(div);
    });

    // Кнопка поиска по systemnummer отображается только в режиме просмотра
    if (!isEditMode && item.systemnummer && item.systemnummer.trim() !== '') {
        const btnSearch = document.createElement('button');
        btnSearch.id = 'modal-sys-search-btn';
        btnSearch.className = 'btn-modal-search';
        btnSearch.textContent = `🔍 Alle Elemente mit Systemnr.: "${item.systemnummer}" finden`;
        
        btnSearch.addEventListener('click', () => {
            closeModal();
            document.getElementById('ort-select').value = '';
            
            const searchContainer = document.getElementById('search-container');
            const searchInput = document.getElementById('search-input');
            searchContainer.style.display = 'block';
            searchInput.value = item.systemnummer;

            renderItems();
        });

        const modalContent = document.querySelector('.modal-content');
        const modalButtons = document.querySelector('.modal-buttons');
        modalContent.insertBefore(btnSearch, modalButtons);
    }

    // Управление текстом и видимостью кнопок в панели
    // Управление видимостью кнопок в панели модального окна
    const btnEdit = document.getElementById('btn-edit');
    const btnSave = document.getElementById('btn-save');

    if (isEditMode) {
        btnEdit.style.display = 'none';  // Скрываем «Bearbeiten»
        btnSave.style.display = 'block'; // Показываем «Speichern»
    } else {
        btnEdit.style.display = 'block'; // Показываем «Bearbeiten»
        btnSave.style.display = 'none';  // Скрываем «Speichern»
    }
}

// Переключение в режим редактирования по кнопке "Bearbeiten"

function toggleEditMode() {
    isEditMode = true;
    renderModalContent(); // Перерисовываем модальное окно в режиме инпутов
}

// Сохранение изменений в базу данных
async function saveItemChanges() {
    if (!currentEditingId || !cachedItem) {
        alert('Fehler: Kein Datensatz ausgewählt.');
        return;
    }

    // Собираем все заполненные/измененные данные из инпутов и текстовых полей
    const inputs = document.querySelectorAll('#modal-details input, #modal-details textarea');
    
    // Начинаем с копии текущего кэша, чтобы не потерять скрытые или неизмененные ключи
    const updatedData = { ...cachedItem };

    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        if (key) {
            updatedData[key] = input.value.trim();
        }
    });

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Записываем обновленный объект обратно в IndexedDB
    store.put(updatedData);

    tx.oncomplete = async () => {
        cachedItem = updatedData; // Обновляем кэш
        isEditMode = false;       // Возвращаем режим просмотра
        renderModalContent();     // Перерисовываем модальное окно обратно в текст
        await loadOrtCategories();
        await renderItems();      // Обновляем главную таблицу
        
        alert('Änderungen erfolgreich gespeichert!');
    };

    tx.onerror = (event) => {
        console.error('Fehler beim Speichern:', event.target.error);
        alert('Fehler beim Speichern der Daten.');
    };
}

function closeModal() {
    document.getElementById('item-modal').style.display = 'none';
    currentEditingId = null;
    cachedItem = null;
    isEditMode = false;
    
    // Возвращаем исходное состояние кнопок
    const btnEdit = document.getElementById('btn-edit');
    const btnSave = document.getElementById('btn-save');
    if (btnEdit) btnEdit.style.display = 'block';
    if (btnSave) btnSave.style.display = 'none';
}

async function exportDatabase() {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = async () => {
        const items = request.result;
        if (items.length === 0) {
            alert('Die Datenbank ist leer. Es gibt nichts zu exportieren.');
            return;
        }

        const keys = originalHeaders.length > 0 ? originalHeaders : Object.keys(items[0]).filter(k => k !== 'id');
        
        let fileContent = keys.join('\t') + '\n';

        items.forEach(item => {
            const row = keys.map(key => {
                let val = item[key] !== undefined ? item[key] : '';
                // Превращаем значение в строку и заменяем переносы строк на пробелы, 
                // чтобы они не ломали структуру TSV-файла
                return String(val).replace(/(\r\n|\n|\r)/g, ' ');
            });
            fileContent += row.join('\t') + '\n';
        });

        // Формируем имя файла с датой и временем
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const filename = `equipment_${year}-${month}-${day}_${hours}-${minutes}.txt`;

        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const file = new File([blob], filename, { type: 'text/plain' });

        // Проверяем, поддерживает ли устройство нативный системный диалог «Поделиться» (Web Share API)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Anlagendatenbank Export',
                    text: 'Aktuelle Exportdatei der Anlagendatenbank.',
                    files: [file]
                });
                return; // Успешно передано в системное меню «Поделиться»
            } catch (error) {
                // Если пользователь отменил отправку, просто выходим
                if (error.name === 'AbortError') return;
                console.log('Share API fehlgeschlagen, fallback auf Download...', error);
            }
        }

        // Запасной вариант (Fallback): если Web Share API не поддерживается, файл скачивается стандартным способом
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
}

document.getElementById('file-input').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    // Читаем файл как бинарный буфер, чтобы избежать проблем с кодировками на GitHub Pages
    reader.onload = async function(e) {
        try {
            const buffer = e.target.result;
            let textContent;

            // Сначала пробуем стандартный UTF-8
            try {
                const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                textContent = utf8Decoder.decode(buffer);
            } catch (err) {
                // Если не получилось (например, файл из Windows), читаем в кодировке Windows-1252 (для немецкого языка)
                const winDecoder = new TextDecoder('windows-1252');
                textContent = winDecoder.decode(buffer);
            }

            const parsedItems = parseTextData(textContent);

            if (parsedItems.length === 0) {
                alert('Fehler: Die Datei ist leer oder ungültig.');
                return;
            }

            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            await store.clear();
            parsedItems.forEach(item => store.add(item));

            tx.oncomplete = async () => {
                alert('Daten erfolgreich importiert!');
                await loadOrtCategories();
                await renderItems();
                
                // Сбрасываем значение инпута, чтобы можно было повторно загрузить тот же файл
                event.target.value = '';
            };
        } catch (err) {
            alert('Fehler beim Verarbeiten der Datei.');
            console.error('Import-Fehler:', err);
        }
    };

    reader.onerror = function() {
        alert('Fehler beim Lesen der Datei.');
    };

    reader.readAsArrayBuffer(file);
});

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
