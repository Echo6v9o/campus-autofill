/**
 * 多条经历（实习/项目）专项测试
 * 场景A：结构化表单有两个经历块 → 两条数据按位置对位填写
 * 场景B：整段式表单（只有一个大文本框）+ v1.1 旧字符串资料 → 自动迁移并合并填入
 * 场景C：结构化表单只有一个块但有"添加实习经历"按钮 → 自动点按钮扩展槽位后填第二条
 * 运行：node test/multi-entry.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'campus-autofill.user.js'), 'utf8');

function block(id, orgLb, roleLb, periodLb, descLb) {
  return `<div class="entry-block" id="${id}">
    <div class="row"><label>${orgLb}</label><input id="${id}org"></div>
    <div class="row"><label>${roleLb}</label><input id="${id}role"></div>
    <div class="row"><label>${periodLb}</label><input id="${id}period"></div>
    <div class="row"><label>${descLb}</label><textarea id="${id}desc"></textarea></div>
  </div>`;
}

const ENTRIES = [
  { org: 'XX科技有限公司', role: '前端开发实习生', period: '2024.06-2024.09', desc: 'Vue3 组件重构，首屏加载降低 40%。' },
  { org: 'YY网络', role: '全栈实习生', period: '2023.06-2023.09', desc: '参与活动页开发。' },
];
const PROJECTS = [
  { org: '校园二手交易平台', role: '负责人', period: '2023.03-2023.11', desc: 'Vue3 + Node.js + MySQL，注册用户 2000+。' },
];

async function runPage(html, profile) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((r) => (window.document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 30, height: 20, top: 0, left: 0, right: 30, bottom: 20 };
  };
  window.localStorage.setItem('caf_profile', JSON.stringify(profile));
  window.eval(SRC);
  await new Promise((r) => setTimeout(r, 250));
  const doc = window.document;
  doc.querySelector('[data-act="fill"]').click();
  const done = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = doc.getElementById('caf-toast');
      if (el && /填写完成/.test(el.textContent)) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > 8000) { clearInterval(iv); resolve(false); }
    }, 100);
  });
  return { window, doc, done };
}

(async () => {
  let pass = 0, total = 0;
  const check = (name, ok) => { total++; if (ok) pass++; console.log((ok ? '  ✓' : '  ✗') + ' ' + name); };
  const $ = (doc, id) => doc.getElementById(id);

  // ---- 场景A：两个实习块 + 一个项目块，按位置对位 ----
  {
    console.log('场景A：结构化多块对位');
    const html = `<body><form>
      ${block('i1', '实习单位', '实习岗位', '实习起止时间', '工作内容')}
      ${block('i2', '实习单位', '实习岗位', '实习起止时间', '工作内容')}
      ${block('p1', '项目名称', '项目角色', '项目起止时间', '项目描述')}
    </form></body>`;
    const r = await runPage(html, { internships: ENTRIES, projects: PROJECTS });
    check('流程完成', r.done);
    check('实习① 公司', $(r.doc, 'i1org').value === 'XX科技有限公司');
    check('实习① 描述', $(r.doc, 'i1desc').value === 'Vue3 组件重构，首屏加载降低 40%。');
    check('实习② 公司（对位第2块）', $(r.doc, 'i2org').value === 'YY网络');
    check('实习② 职位', $(r.doc, 'i2role').value === '全栈实习生');
    check('项目① 名称', $(r.doc, 'p1org').value === '校园二手交易平台');
    check('项目① 描述', $(r.doc, 'p1desc').value === 'Vue3 + Node.js + MySQL，注册用户 2000+。');
  }

  // ---- 场景B：整段式 + 旧版字符串迁移 ----
  {
    console.log('场景B：整段式合并 + 旧资料迁移');
    const html = `<body><form>
      <div class="row"><label>实习经历</label><textarea id="blob"></textarea></div>
      <div class="row"><label>项目经历</label><textarea id="blobP"></textarea></div>
    </form></body>`;
    const legacy = { internship: '旧版整段实习描述：负责后台开发。', project: '旧版项目：管理系统。' };
    const r = await runPage(html, legacy);
    check('流程完成', r.done);
    check('实习整段（迁移后合并）', $(r.doc, 'blob').value === '旧版整段实习描述：负责后台开发。');
    check('项目整段（迁移后合并）', $(r.doc, 'blobP').value === '旧版项目：管理系统。');
  }

  // ---- 场景C：一个块 + 添加按钮自动点击 ----
  {
    console.log('场景C：自动点击表单"添加"按钮');
    const html = `<body><form>
      <div id="wrap">${block('i1', '实习单位', '实习岗位', '实习起止时间', '工作内容')}</div>
      <button type="button" id="addBtn">＋ 添加实习经历</button>
    </form></body>`;
    const r = await runPage(html, { internships: ENTRIES });
    // 模拟表单自己的添加行为：点击后克隆一个空块
    r.doc.getElementById('addBtn').addEventListener('click', () => {
      const n = r.doc.querySelectorAll('.entry-block').length + 1;
      const t = r.doc.createElement('div');
      t.innerHTML = block('i' + n, '实习单位', '实习岗位', '实习起止时间', '工作内容');
      r.doc.getElementById('wrap').appendChild(t.firstChild);
    });
    // 重新填写（第一次点击 fill 时监听尚未挂上会失败，这里验证第二次）
    r.doc.querySelector('[data-act="fill"]').click();
    const done2 = await new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const el = r.doc.getElementById('caf-toast');
        if (el && /填写完成/.test(el.textContent)) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > 8000) { clearInterval(iv); resolve(false); }
      }, 100);
    });
    check('流程完成', done2);
    check('实习① 公司', $(r.doc, 'i1org').value === 'XX科技有限公司');
    check('自动新增了第2块', !!$(r.doc, 'i2org'));
    check('实习② 公司（扩展槽位后填入）', $(r.doc, 'i2org').value === 'YY网络');
    check('实习② 描述', $(r.doc, 'i2desc').value === '参与活动页开发。');
  }

  console.log(`\n${pass}/${total} 通过`);
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
