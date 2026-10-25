// Самопроверка маски телефона (v2/js/telefon.js): node vitrina_hinkalnaya/instrumenty/proverit_masku_telefona.mjs — молчит, если всё верно.
import assert from 'node:assert/strict';
import { razobratNomer, maskaNomera } from '../v2/js/telefon.js';

const n = (s) => razobratNomer(s).nomer;
assert.equal(n('7'), ''); assert.equal(razobratNomer('7').kod, true);
assert.equal(n('8'), ''); assert.equal(n(''), ''); assert.equal(razobratNomer('').kod, false);
assert.equal(n('+7 (916) 805-45-70'), '9168054570');
assert.equal(n('89168054570'), '9168054570');
assert.equal(n('9168054570'), '9168054570');
assert.equal(n('+7 916 805 45 70 99'), '9168054570');          // лишнее в конце не сдвигает номер
assert.equal(n('+7 (891) 680-54-570'), '9168054570');          // «+7 » и ещё «8 916…»
assert.equal(n('+7 (800) 555-35-35'), '8005553535');           // 8-800 после кода — номер
assert.equal(n('+7 (701) 234-56-78'), '7012345678');           // Казахстан +7 7…
assert.equal(maskaNomera(''), '+7 '); assert.equal(maskaNomera('', false), '');
assert.equal(maskaNomera('916'), '+7 (916');
assert.equal(maskaNomera('9168'), '+7 (916) 8');
assert.equal(maskaNomera('9168054570'), '+7 (916) 805-45-70');
// маска и разбор сходятся: отформатированный номер разбирается в тот же номер на каждом шаге
for (let i = 1; i <= 10; i++) assert.equal(n(maskaNomera('9168054570'.slice(0, i))), '9168054570'.slice(0, i));
