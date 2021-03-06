let posts = [];
let editor;
let answers = {};
let editedAnswers = {};
let postOrder = [];

function main() {
    editor = new SimpleMDE({
        element: document.getElementById('answers'),
        spellChecker: false
    });
    if (!editor.isPreviewActive()) {
        editor.togglePreview();
    }

    Promise.all([
        getLocalJson('answers'),
        getLocalJson('pol4chanPosts'),
        getLocalJson('polTrip8chanPosts'),
        getLocalJson('cbtsNonTrip8chanPosts'),
        getLocalJson('cbtsTrip8chanPosts'),
        getLocalJson('thestormTrip8chanPosts'),
        getLocalJson('greatawakeningTrip8chanPosts')

    ]).then(values => {
        answers = values[0];
        posts = []
            .concat(values[1])
            .concat(values[2])
            .concat(values[3])
            .concat(values[4])
            .concat(values[5])
            .concat(values[6]);
        posts.sort((a, b) => b.timestamp - a.timestamp);
        postOrder.push(...(posts.map(p => p.id).reverse()));

        render(posts);
        initSearch();

        loadLocalAnswers();
        selectAnswers(null);
        checkForNewPosts();
    });

    toggleAnswers();
}

function initSearch() {
    const searchElement = document.querySelector('input[type=search]');
    searchElement.oninput = () => {
        const value = searchElement.value;

        const keywordInText = value === value.toLowerCase()
            ? text => text
                .toLowerCase()
                .includes(value)
            : text => text.includes(value);

        const ids = posts
            .filter(p => p.text && keywordInText(p.text))
            .map(p => p.id);

        applyFilter(ids);
        if (value == '')
            setParams({});
        else
            setParams({q: value});
    };

    const postLines = posts
        .filter(p => p.text)
        .map(p => ({
            id: p.id,
            lines: p
                .text
                .split('\n')
                .map(t => t.trim().replace(/[.?]/g, ''))
        }));

    const result = {};
    for (const post of postLines) {
        for (const line of post.lines) {
            if (line == '')
                continue;
            if (!result[line])
                result[line] = new Set();
            result[line].add(post.id);
        }
    }
    const resultList = Object
        .keys(result)
        .map(k => ({line: k, ids: result[k]}))
        .filter(a => a.ids.size > 2);

    resultList.sort((a, b) => b.ids.size - a.ids.size);
    const datalist = document.querySelector('#hints');
    datalist.innerHTML = resultList
        .map(i => `<option label="${i.ids.size}">${i.line}</option>`)
        .join('\n');

    const query = getParams(location.search);
    if ('q' in query) {
        searchElement.value = query.q;
        searchElement.oninput();
    }
}

function applyFilter(ids) {
    let count = 0;
    for (const element of Array.from(document.querySelectorAll('article'))) {
        if (ids.includes(element.item.id)) {
            element.hidden = false;
            count++;
        } else {
            element.hidden = true;
        }
    }
    document.querySelector('#count').textContent = `${count}`;
    for(const h3 of Array.from(document.querySelectorAll('main .sticky'))) {
        const section = h3.nextElementSibling;
        h3.hidden = Array.from(section.children).every(c => c.hidden);
    }
}

function toggleAnswers() {
    document
        .body
        .classList
        .toggle('answers-disabled')
}

function toggleDialog() {
    const dialog = document.querySelector('.dialog');
    dialog
        .classList
        .toggle('open');
}

function notify(text) {
    const element = document.querySelector('#notification');
    if (text) {
        element.hidden = false;
        element.textContent = text;
    } else {
        setTimeout(() => {
            element.hidden = true;
        }, 3000);
    }
}

// RENDERING

function render(items) {
    const container = document.querySelector('main');
    container.innerHTML = '';
    let lastDate = new Date(items[0].timestamp * 1000);
    lastDate.setHours(0, 0, 0, 0);
    let subContainer = tag('section');
    container.appendChild(tag.fromString(html.date(lastDate)));
    for (const item of items) {
        const date = new Date(item.timestamp * 1000);
        date.setHours(0, 0, 0, 0);
        if (lastDate.getTime() !== date.getTime()) {
            lastDate = date;
            container.appendChild(subContainer);
            container.appendChild(tag.fromString(html.date(date)));
            subContainer = tag('section');
        }
        const element = tag.fromString(html.postWithReplies(item));
        element.item = item;
        subContainer.appendChild(element);
    }
    container.appendChild(subContainer);
}

const html = {
    postWithReplies: (post) => {
        return `
        <article id="post${post.id}" class="source_${post.source}${ifExists(post.timestampDeletion, () => ' deleted')}">
          <button onclick="selectAnswers(${post.id})" class="answers ${answerButtonClass(post.id)}">answers</button>
          <span class="counter">${postOrder.indexOf(post.id) + 1}</span>
          ${forAll(post.references, x => `
          <blockquote id="post${post.id}">${html.post(x)}</blockquote>`)}
          ${html.post(post)}
        </article>`;
    },
    date: (date) => {
        return `<h3 class="center sticky"><time datetime="${date.toISOString()}">${formatDate(date)}</time></h3>`
    },
    post: (post) => {
        if (!post)
            return '';
        const date = new Date(post.timestamp * 1000);
        const edate = new Date(post.edited * 1000);
        return `
        <header>
            <time datetime="${date.toISOString()}">${formatTime(date)}</time>

            ${ifExists(post.subject, x => `
            <span class="subject" title="subject">${x}</span>`)}

            <span class="name" title="name">${post.name}</span>

            ${ifExists(post.trip, x => `
            <span class="trip" title="trip">${x}</span>`)}

            ${ifExists(post.email, x => `
            <span class="email" title="email">${x}</span>`)}

            ${ifExists(post.userId, x => `
            <span class="userid" title="userid">ID: ${x}</span>`)}

            <a href="${post.link}" target="_blank">${post.id}</a>
            
            ${ifExists(post.isNew, () => `<span class="new">NEW</span>`)}

            ${ifExists(post.edited, x => `
            <span class="edited" title="${edate.toISOString()}">Last edited at ${formatDate(edate)}, ${formatTime(edate)}</span>`)}
        </header>

        ${forAll(post.images, (i) => post.isNew ? html.img(i) : html.img(withLocalUrl(i)))}

        <div class="text">${addHighlights(post.text)}</div>`;
    },
    img: (image) => {
        if (!image)
            return '';
        return `<a href="${image.url}" target="_blank">
          ${ifExists(image.filename, x => `
          <span class="filename" title="file name">${x}</span>`)}
          <img src="${image.url}" class="contain" width="300" height="300">
        </a>`;
    }
};
const answerButtonClass = (postId) => editedAnswers[postId]
    ? 'edited'
    : answers[postId] && answers[postId].length
        ? ''
        : 'empty';

const withLocalUrl = (image) => ({filename: image.filename, url: localImgSrc(image.url)});

const localImgSrc = src => 'data/images/' + src
    .split('/')
    .slice(-1)[0];

const legendPattern = new RegExp(`([^a-zA-Z])(${Object.keys(legend).join('|')})([^a-zA-Z])`, 'g');

const addHighlights = text => !text
    ? ''
    : text.replace(/(^>[^>].*\n?)+/g, (match) => `<q>${match}</q>`)
        .replace(/(https?:\/\/[.\w\/?\-=&#]+)/g, (match) => match.endsWith('.jpg')
            ? `<img src="${match}" alt="image">`
            : `<a href="${match}" target="_blank">${match}</a>`)
        .replace(/(\[[^[]+])/g, (match) => `<strong>${match}</strong>`)
        .replace(legendPattern, (match, p1, p2, p3, o, s) => `${p1}<abbr title="${legend[p2]}">${p2}</abbr>${p3}`);

// PARSE 8chan

function checkForNewPosts() {
    notify('Searching for new posts');

    const alreadyParsedIds = [];
        // Array.from(new Set(posts.filter(p => p.source = '8chan_greatawakening')))
        // .map(p => parseInt(p.threadId));

    const catalogUrl = 'https://8ch.net/greatawakening/catalog.json';

    getJson(catalogUrl).then(response => {

        const threads = response.reduce((p, e) => p.concat(e.threads), []);
        const theStormGeneralThreadIds = threads
            .filter(p => p.sub && p.sub.toLowerCase()
            .includes('the storm'))
            .map((p) => p.no);

        const newThreadIds = theStormGeneralThreadIds.filter((id) => !alreadyParsedIds.includes(id));
        console.log(newThreadIds);

        Promise
            .all(newThreadIds.map(getLivePostsByThread))
            .then(result => {
                const newPosts = result.reduce((p, e) => p.concat(e), []);
                notify(`found ${newPosts.length} new posts`);

                newPosts.sort((a, b) => b['timestamp'] - a['timestamp']);
                posts.unshift(...newPosts);
                postOrder.push(...(newPosts.map(p => p.id).reverse()));
                render(posts);
                notify(null);
            });
    });
}

function getLivePostsByThread(id) {
    const threadUrl = (id) => `https://8ch.net/greatawakening/res/${id}.json`;
    const referencePattern = />>(\d+)/g;

    return getJson(threadUrl(id)).then(result => {
        if (!result.posts.some((p) => p.trip === '!UW.yye1fxo')) {
            return [];
        }
        const threadPosts = result
            .posts
            .map(parseLive8chanPost);

        // !UW.yye1fxo has not been compromised at this time
        const newPosts = threadPosts.filter((p) => p.trip === '!UW.yye1fxo');

        for (const newPost of newPosts) {
            referencePattern.lastIndex = 0;
            if (referencePattern.test(newPost.text)) {
                referencePattern.lastIndex = 0;
                const referenceId = referencePattern.exec(newPost.text)[1];
                newPost.references = threadPosts.filter((p) => p.id == referenceId);
            }
        }
        console.log(`added ${newPosts.length} posts from thread ${id}`);
        return newPosts;
    });
}

function parseLive8chanPost(post) {
    const getImages = (chanPost) => [{
        url: `https://media.8ch.net/file_store/${chanPost.tim}${chanPost.ext}`,
        filename: chanPost.filename
    }].concat(chanPost.extra_files);
    return {
        images: post.tim
            ? getImages(post)
            : [],
        id: post.no.toString(),
        userId: post.id,
        timestamp: post.time,
        title: post.title,
        name: post.name,
        email: post.email,
        trip: post.trip,
        text: cleanHtmlText(post.com),
        subject: post.sub,
        source: '8chan_greatawakening',
        link: `https://8ch.net/greatawakening/res/${post.resto}.html#${post.no}`,
        threadId: post.resto.toString(),
        isNew: true
    };
}

function cleanHtmlText(htmlText) {
    const emptyPattern = /<p class="body-line empty "><\/p>/g;
    const referencePattern = /<a [^>]+>&gt;&gt;(\d+)<\/a>/g;
    const linkPattern = /<a [^>]+>(.+?)<\/a>/g;
    const quotePattern = /<p class="body-line ltr quote">&gt;(.+?)<\/p>/g;
    const paragraphPattern = /<p class="body-line ltr ">(.+?)<\/p>/g;

    return htmlText
        .replace(emptyPattern, '\n')
        .replace(referencePattern, (m, p1) => `>>${p1}`)
        .replace(linkPattern, (m, p1) => `${p1}`)
        .replace(quotePattern, (m, p1) => `>${p1}\n`)
        .replace(paragraphPattern, (m, p1) => `${p1}\n`);
}

//////////////////// answers functions //////////////////

const ifElement = (selector, callback) => {
    const element = document.querySelector(selector);
    if (element)
        return callback(element);
};

function copyAnswers() {
    ifElement('article.selected', selectedArticle => {
        const postId = selectedArticle.item.postId;
        editedAnswers[postId] = editor.value();
    });

    const copyTextarea = document.querySelector('#Copy');
    copyTextarea.value = JSON.stringify(editedAnswers, null, 2);

    copyTextarea.select();
    try {
        document.execCommand('copy');
        copyTextarea.value = '';
    } catch (err) {
        alert('browser doesn\'t support copy');
    }
}

function resetAnswer() {
    ifElement('article.selected', selectedArticle => {
        const postId = selectedArticle.item.id;
        delete editedAnswers[postId];
        const value = answers[postId] || '';
        editor.value(value);
        if (editor.isPreviewActive()) {
            setPreview(editor);
        }
        selectedArticle
            .querySelector('article button')
            .className = `answers ${value
            ? ''
            : 'empty'}`;
    });
}

const answerIsEdited = postId => (!answers[postId] && editor.value().length) || (answers[postId] && answers[postId] !== editor.value());

function selectAnswers(selectedPostId) {
    ifElement('article.selected', selectedArticle => {
        const postId = selectedArticle.item.id;
        if (answerIsEdited(postId)) {
            editedAnswers[postId] = editor.value();
            selectedArticle
                .querySelector('article button')
                .className = `answers edited`
        }
        selectedArticle
            .classList
            .remove('selected');
    });
    if (!selectedPostId) {
        document
            .querySelector('aside h1')
            .innerHTML = `Answers`;
        editor.value('');
        if (editor.isPreviewActive()) {
            setPreview(editor);
        }
        document
            .querySelector('#editor-wrapper')
            .style
            .display = 'none';
    } else {
        document
            .querySelector('#editor-wrapper')
            .style
            .display = 'block';

        const article = document.querySelector(`#post${selectedPostId}`);
        article
            .classList
            .add('selected');

        document
            .querySelector('aside h1')
            .innerHTML = `Answers for <a href="#post${selectedPostId}">${selectedPostId}</a>`;

        const answer = editedAnswers[selectedPostId] !== undefined
            ? editedAnswers[selectedPostId]
            : answers[selectedPostId] || '';
        editor.value(answer);
        // refresh hack
        if (editor.isPreviewActive()) {
            setPreview(editor);
        }
    }
}

function storeLocalAnswers() {
    ifElement('article.selected', selectedArticle => {
        const postId = selectedArticle.item.id;
        editedAnswers[postId] = editor.value();
    });
    localStorage.setItem('answers', JSON.stringify(editedAnswers));
}

function loadLocalAnswers() {
    const newAnswers = localStorage.getItem('answers');
    if (newAnswers) {
        editedAnswers = JSON.parse(newAnswers);
    }
}

function setPreview(editor) {
    const wrapper = editor
        .codemirror
        .getWrapperElement();
    const toolbar = editor.options.toolbar
        ? editor.toolbarElements.preview
        : null;
    const preview = wrapper.lastChild;

    preview
        .classList
        .add("editor-preview-active");

    if (toolbar) {
        toolbar
            .classList
            .add("active");

        const toolbarDiv = wrapper.previousSibling;
        toolbarDiv
            .classList
            .add("disabled-for-preview");
    }
    preview.innerHTML = editor
        .options
        .previewRender(editor.value(), preview);
}

function getAllAnswersUpdate() {
    return JSON.stringify(Object.assign({}, answers, editedAnswers), null, 2);
}

window.addEventListener('beforeunload', storeLocalAnswers);

document.addEventListener('DOMContentLoaded', main, false);

/*
C!Odemonkey.  ☯ 8chan Administrator 01/06/18 (Sat) 16:19:37 1fb886 No.6196
A summary of events.
>January 2
I added super secure tripcodes. /cbts/ BO secures one.
>January 5 (Japan time)
Someone on /sudo/ pointed out that super secure tripcodes excluded capital letters, a big oversight which I fixed. I changed the code and announced it just on /sudo/. /cbts/ BO doesn't know about it and continues using the tripcode he secured, but because the code changed, his tripcode also changed - this led to confusion.
Q comes back and posts on /cbts/ normally. Post history is not the same, IP hash is not the same. /cbts/ BO assumes, incorrectly, that this is not Q, even though there are a number of reasons why a post history may start from zero, including changing VPN providers, changing VPN IP locations, using cellular data, resetting your modem, posting from a different location, using a different IP (hotel, restaurant etc.).
/cbts/ BO deletes those posts.
Then, Q goes to /pol/, where he is banned, and then /thestorm/, where he asks for verification.
Around 12 hours later, I confirm it is actually Q using his verified tripcode (still uncracked) on /thestorm/.
*/