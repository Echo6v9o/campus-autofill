/**
 * 级联选择器专项测试（模拟 antd Cascader）
 * 场景1：籍贯 省/市/区 三级级联（readonly input 触发）
 * 场景2：期望城市 单列城市选择，"杭州 / 上海" 多意向值逐个尝试
 * 运行：node test/cascader.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'campus-autofill.user.js'), 'utf8');

const HTML = `<!DOCTYPE html><html><body>
<form>
  <div class="row"><label>籍贯</label><input id="np" readonly></div>
  <div class="cascader-dropdown" id="panel1" data-hidden="1">
    <ul class="ant-cascader-menu" id="col1">
      <li class="ant-cascader-menu-item" data-v="浙江省" data-next="col2">浙江省</li>
      <li class="ant-cascader-menu-item" data-v="广东省" data-next="col2g">广东省</li>
    </ul>
    <ul class="ant-cascader-menu" id="col2" data-hidden="1">
      <li class="ant-cascader-menu-item" data-v="杭州市" data-next="col3">杭州市</li>
      <li class="ant-cascader-menu-item" data-v="宁波市">宁波市</li>
    </ul>
    <ul class="ant-cascader-menu" id="col2g" data-hidden="1">
      <li class="ant-cascader-menu-item" data-v="广州市">广州市</li>
    </ul>
    <ul class="ant-cascader-menu" id="col3" data-hidden="1">
      <li class="ant-cascader-menu-item" data-v="余杭区">余杭区</li>
      <li class="ant-cascader-menu-item" data-v="西湖区">西湖区</li>
    </ul>
  </div>
  <div class="row"><label>期望工作城市</label><input id="ec" role="combobox" type="text"></div>
  <div class="cascader-dropdown" id="panel2" data-hidden="1">
    <ul class="ant-cascader-menu" id="cityCol">
      <li class="ant-cascader-menu-item" data-v="杭州市">杭州市</li>
      <li class="ant-cascader-menu-item" data-v="上海市">上海市</li>
    </ul>
  </div>
</form>
</body></html>`;

(async () => {
  const dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((r) => (window.document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.closest && this.closest('[data-hidden="1"]')) {
      return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    }
    return { width: 30, height: 20, top: 0, left: 0, right: 30, bottom: 20 };
  };
  window.localStorage.setItem('caf_profile', JSON.stringify({
    native_place: '浙江省杭州市余杭区', expect_city: '杭州 / 上海',
  }));

  const doc = window.document;
  const show = (id) => doc.getElementById(id).removeAttribute('data-hidden');
  const hide = (id) => doc.getElementById(id).setAttribute('data-hidden', '1');
  const path1 = [];

  // 场景1：点省展开市、点市展开区、点区写值收起
  doc.getElementById('np').addEventListener('click', () => show('panel1'));
  [...doc.querySelectorAll('#panel1 li')].forEach((li) => li.addEventListener('click', () => {
    path1.push(li.dataset.v);
    if (li.dataset.next) { show(li.dataset.next); return; }
    doc.getElementById('np').value = path1.join(' / ');
    hide('panel1');
  }));

  // 场景2：单列城市，点选即写值
  doc.getElementById('ec').addEventListener('click', () => show('panel2'));
  [...doc.querySelectorAll('#panel2 li')].forEach((li) => li.addEventListener('click', () => {
    doc.getElementById('ec').value = li.dataset.v;
    hide('panel2');
  }));

  window.eval(SRC);
  await new Promise((r) => setTimeout(r, 300));
  doc.querySelector('[data-act="fill"]').click();

  const done = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = doc.getElementById('caf-toast');
      if (el && /填写完成/.test(el.textContent)) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > 15000) { clearInterval(iv); resolve(false); }
    }, 100);
  });
  await new Promise((r) => setTimeout(r, 150));

  const checks = [
    ['流程完成', done],
    ['籍贯三级级联（省→市→区）', doc.getElementById('np').value === '浙江省 / 杭州市 / 余杭区'],
    ['期望城市（"杭州 / 上海"多意向尝试）', doc.getElementById('ec').value === '杭州市'],
  ];
  let pass = 0;
  for (const [n, ok] of checks) { console.log((ok ? '  ✓' : '  ✗') + ' ' + n); if (ok) pass++; }
  console.log(`\n${pass}/${checks.length} 通过`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
