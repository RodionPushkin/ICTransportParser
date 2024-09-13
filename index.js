const axios = require('axios');
const xml2js = require('xml2js');
const express = require('express');
const cheerio = require('cheerio');
const { format, parse } = require('date-fns');
const { v4: uuidv4 } = require('uuid'); // Импортируем функцию для генерации UUID
const app = express();

// URL с RSS XML
const XML_URL = 'https://ictransport.ru/rss-feed-827453696181.xml';

// Функция для получения и парсинга XML
async function fetchAndParseXML() {
    try {
        const response = await axios.get(XML_URL);
        const xml = response.data;

        // Преобразование XML в JSON
        const result = await xml2js.parseStringPromise(xml, { mergeAttrs: true });
        const items = result.rss.channel[0].item;

        // Обработка и возврат массива элементов
        return items.map(item => {
            // Генерация UUID для каждой записи
            const itemId = uuidv4();
            
            // Проверяем наличие каждого элемента и его свойств
            const content = item['turbo:content'] ? item['turbo:content'][0] : 'Нет контента';
            
            // Разбор HTML-контента
            let header = 'Нет заголовка';
            let imageUrl = 'Нет изображения';
            let textContent = 'Нет текста';

            if (content !== 'Нет контента') {
                const $ = cheerio.load(content, { xmlMode: true });

                header = $('header h1').text() || 'Нет заголовка';
                imageUrl = $('figure img').attr('src') || 'Нет изображения';
                textContent = $('.t-redactor__text').text() || 'Нет текста';
            }

            // Форматируем дату
            const pubDate = item.pubDate ? item.pubDate[0] : 'Нет даты';
            let formattedDate = 'Нет даты';
            try {
                // Преобразуем строку даты в объект Date и форматируем
                const date = new Date(pubDate);
                formattedDate = format(date, 'dd MMMM yyyy, HH:mm'); // Измените формат по вашему усмотрению
            } catch (error) {
                console.error('Ошибка при форматировании даты:', error.message);
            }

            return {
                id: itemId, // Добавляем UUID
                title: item.title ? item.title[0] : 'Нет заголовка',
                link: item.link ? item.link[0] : 'Нет ссылки',
                pubDate: formattedDate,
                header,
                imageUrl,
                textContent,
                originalDate: pubDate // Сохраняем оригинальную дату для сортировки и фильтрации
            };
        });
    } catch (error) {
        console.error('Ошибка при получении или парсинге XML:', error.message);
        return [];
    }
}

// Кэширование данных
let cachedItems = [];
fetchAndParseXML().then(items => {
    cachedItems = items;
});

// Маршрут для получения записей с пагинацией и сортировкой http://localhost:3000/items?start=0&limit=4&sort=desc
app.get('/items', (req, res) => {
    let { start = 0, limit = 20, sort = 'asc' } = req.query;

    // Преобразуем start и limit в целые числа
    start = parseInt(start, 10);
    limit = parseInt(limit, 10);

    // Проверяем корректность параметра sort
    if (sort !== 'asc' && sort !== 'desc') {
        return res.status(400).json({ error: 'Некорректное значение параметра sort. Используйте "asc" или "desc".' });
    }

    // Сортировка данных по оригинальной дате
    const sortedItems = [...cachedItems].sort((a, b) => {
        const dateA = new Date(a.originalDate);
        const dateB = new Date(b.originalDate);
        return sort === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // Пагинация
    const paginatedItems = sortedItems.slice(start, start + limit);

    // Возврат данных
    res.json(paginatedItems);
});

// Функция для преобразования строки даты в объект Date
function parseDate(dateStr) {
    return parse(dateStr, 'dd.MM.yyyy', new Date());
}

// Маршрут для получения записей по дате
app.get('/items/date', (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Параметры startDate и endDate обязательны.' });
    }

    try {
        // Преобразование строк даты в объекты Date
        const start = parseDate(startDate);
        const end = parseDate(endDate);

        // Фильтрация записей по дате
        const filteredItems = cachedItems.filter(item => {
            const itemDate = new Date(item.originalDate);
            return itemDate >= start && itemDate <= end;
        });

        res.json(filteredItems);
    } catch (error) {
        console.error('Ошибка при фильтрации по дате:', error.message);
        res.status(400).json({ error: 'Некорректный формат даты.' });
    }
});

// Маршрут для получения записи по UUID
app.get('/items/uuid/:uuid', (req, res) => {
    const { uuid } = req.params;

    // Поиск записи по UUID
    const item = cachedItems.find(item => item.id === uuid);

    if (!item) {
        return res.status(404).json({ error: 'Запись не найдена.' });
    }

    res.json(item);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
