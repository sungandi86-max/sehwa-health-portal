import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { isRetiredStudentReply } from "../common/studentReplyRetirement.js";

const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MemoryRouter } from 'react-router-dom';
    import UploadPage from './src/pages/UploadPage.jsx';
    import UploadCenter from './src/components/UploadCenter.jsx';
    import SubmitModal from './src/components/SubmitModal.jsx';
    export function render(kind, props, url = '/upload') {
      const Component = { page: UploadPage, center: UploadCenter, modal: SubmitModal }[kind];
      return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><Component {...props}/></MemoryRouter>);
    }`, resolveDir: process.cwd(), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { "import.meta.env": "{}" },
  plugins: [{ name: "no-remote-firebase", setup(builder) {
    builder.onLoad({ filter: /[/\\]src[/\\]lib[/\\]firebase\.js$/ }, () => ({ contents: `
      export const app = {}, auth = {}, db = {}, googleProvider = {}, microsoftProvider = {};
      export class GoogleAuthProvider {}
      export function assertAuthLoginBoundary() { throw new Error('No auth in synthetic rendering'); }
    ` }));
  } }],
});
const { createRequire } = await import("node:module");
const rendered = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), rendered, rendered.exports);
const { render } = rendered.exports;

test("retired direct links and modal aliases render a notice without inputs", () => {
  for (const type of ["student_tb_reply", "student-file", "student_file", "studentfile", "tbreply", " STUDENT-FILE "]) {
    // Given any old student link or direct modal invocation; when rendered; then no data entry exists.
    assert.equal(isRetiredStudentReply(type), true);
    for (const html of [render("page", {}, `/upload?mode=public&type=${encodeURIComponent(type)}`),
      render("modal", { type })]) {
      assert.match(html, /해당 제출 기능은 운영이 종료되었습니다/);
      assert.doesNotMatch(html, /<input|<select|<textarea|type="file"|업로드하기/);
    }
  }
});

test("stale public cards cannot restore student entry and staff copy stays intact", () => {
  const items = [
    { canonicalType: "tb", title: "개별 건강검진 확인서 제출", deadline: "12월 30일까지", target: "교직원" },
    { canonicalType: "cpr", title: "심폐소생술 이수증 제출", deadline: "11월 30일까지", target: "교직원" },
    { canonicalType: "infection", title: "감염병 발생 보고", deadline: "수시", target: "담임" },
    { canonicalType: "student_tb_reply", title: "결핵검진 진료회신 제출" },
    { uploadType: "student-file", title: "과거 학생 제출" },
  ];
  const html = render("center", { items });
  for (const text of ["개별 건강검진 확인서", "심폐소생술", "감염병 발생 보고", "12월 30일까지", "11월 30일까지", "수시"]) {
    assert.ok(html.includes(text), text);
  }
  assert.doesNotMatch(html, /진료회신 제출|과거 학생 제출/);
});
