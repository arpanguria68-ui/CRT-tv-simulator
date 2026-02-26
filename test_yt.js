import fs from 'fs';
const url = 'https://www.youtube.com/watch?v=eYQBUHXa86Y';
fetch(url).then(r => r.text()).then(html => {
    fs.writeFileSync('yt.html', html);
    const m1 = html.match(/"lengthSeconds":"(\d+)"/);
    const m2 = html.match(/"approxDurationMs":"(\d+)"/);
    console.log('lengthSeconds:', m1 ? m1[1] : null);
    console.log('approxDurationMs:', m2 ? m2[1] : null);
});
