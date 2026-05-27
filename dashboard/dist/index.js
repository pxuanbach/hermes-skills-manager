/**
 * Hermes Skills Manager — Dashboard Plugin
 *
 * View, edit, and manage Hermes agent skills from the dashboard.
 * Supports viewing SKILL.md content, patching skill content,
 * and managing skill files (references/, templates/, etc.).
 *
 * Plain IIFE, no build step. Uses window.__HERMES_PLUGIN_SDK__ for React +
 * shadcn primitives. Bundle is pre-built and the plugin_api.py backend
 * handles all skill mutations via skill_manage().
 */

(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;
  var React = SDK.React;
  var h = React.createElement;
  var components = SDK.components;
  var Card = components.Card;
  var CardContent = components.CardContent;
  var CardHeader = components.CardHeader;
  var CardTitle = components.CardTitle;
  var Badge = components.Badge;
  var Button = components.Button;
  var Input = components.Input;
  var Label = components.Label;
  var Select = components.Select;
  var SelectOption = components.SelectOption;
  var Separator = components.Separator;
  var Tabs = null; // removed
  var TabsList = null;
  var TabsTrigger = null;
  var hooks = SDK.hooks;
  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useCallback = hooks.useCallback;
  var useMemo = hooks.useMemo;
  var useRef = hooks.useRef;
  var utils = SDK.utils;
  var cn = utils.cn;
  var timeAgo = utils.timeAgo;

  // ── API client ────────────────────────────────────────────────────────────

  var API = "/api/plugins/skills-manager";

  function apiList() {
    return SDK.fetchJSON(API + "/skills");
  }

  function apiGetSkill(name) {
    return SDK.fetchJSON(API + "/skills/" + encodeURIComponent(name));
  }

  function apiMutate(name, action, body) {
    var payload = { action: action };
    if (body.old_string !== undefined) payload.old_string = body.old_string;
    if (body.new_string !== undefined) payload.new_string = body.new_string;
    if (body.content !== undefined) payload.content = body.content;
    if (body.replace_all !== undefined) payload.replace_all = body.replace_all;
    if (body.absorbed_into !== undefined) payload.absorbed_into = body.absorbed_into;
    return SDK.fetchJSON(API + "/skills/" + encodeURIComponent(name), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function apiReadFile(name, path) {
    var url = API + "/skills/" + encodeURIComponent(name) + "/files/" + path;
    console.log("[SkillsManager] READ " + url);
    return SDK.fetchJSON(url);
  }

  function apiWriteFile(name, path, content) {
    var url = API + "/skills/" + encodeURIComponent(name) + "/files/" + path;
    console.log("[SkillsManager] WRITE " + url, { contentLength: content.length });
    return SDK.fetchJSON(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content }),
    });
  }

  function apiDeleteFile(name, path) {
    return SDK.fetchJSON(API + "/skills/" + encodeURIComponent(name) + "/files/" + path, {
      method: "DELETE",
    });
  }

  function apiUsage(name) {
    return SDK.fetchJSON(API + "/skills/" + encodeURIComponent(name) + "/usage");
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function sourceBadge(source) {
    var s;
    var map = {
      user: { label: "user", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
      bundled: { label: "bundled", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
      external: { label: "external", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    };
    s = map[source] || map.external;
    return h(Badge, { className: s.cls }, s.label);
  }

  function CategoryBadge(props) {
    if (!props.cat) return null;
    return h(Badge, { variant: "outline", className: "text-xs" }, props.cat);
  }

  // ── Skill Browser ─────────────────────────────────────────────────────────

  function SkillBrowser(props) {
    var onSelect = props.onSelect;
    var skills = useState([]);
    var setSkills = skills[1];
    var loading = useState(true);
    var setLoading = loading[1];
    var error = useState(null);
    var setError = error[1];
    var filter = useState("");
    var setFilter = filter[1];
    var sourceFilter = useState("all");
    var setSourceFilter = sourceFilter[1];

    useEffect(function () {
      apiList()
        .then(function (d) { setSkills(d.skills || []); setLoading(false); })
        .catch(function (e) { setError(String(e)); setLoading(false); });
    }, []);

    var filtered = useMemo(function () {
      var list = skills[0];
      var q = filter[0] ? filter[0].toLowerCase() : "";
      if (q) {
        list = list.filter(function (s) {
          return s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);
        });
      }
      if (sourceFilter[0] !== "all") {
        list = list.filter(function (s) { return s.source === sourceFilter[0]; });
      }
      return list;
    }, [skills[0], filter[0], sourceFilter[0]]);

    if (loading[0]) return h("div", { className: "p-6 text-center text-muted-foreground" }, "Loading skills…");
    if (error[0]) return h("div", { className: "p-6 text-center text-destructive" }, "Error: " + error[0]);

    var cats = [];
    var catSet = {};
    skills[0].forEach(function (s) {
      if (s.category && !catSet[s.category]) {
        catSet[s.category] = true;
        cats.push(s.category);
      }
    });
    cats.sort();

    return h("div", { className: "flex flex-col gap-4" },
      h("div", { className: "flex items-center gap-3 flex-wrap" },
        h(Input, {
          placeholder: "Search skills…",
          value: filter[0],
          onChange: function (e) { setFilter(e.target.value); },
          className: "max-w-xs",
        }),
        h("div", { className: "flex items-center gap-1" },
          h(Label, { className: "text-xs text-muted-foreground mr-1" }, "Source"),
          h(Select, {
            value: sourceFilter[0],
            onValueChange: function (v) { setSourceFilter(v); },
          },
            h(SelectOption, { value: "all" }, "All sources"),
            h(SelectOption, { value: "user" }, "User"),
            h(SelectOption, { value: "bundled" }, "Bundled"),
            h(SelectOption, { value: "external" }, "External"),
          ),
        ),
        h("span", { className: "text-xs text-muted-foreground ml-auto" },
          filtered.length + " / " + skills[0].length + " skills"
        ),
      ),

      cats.length > 0 && h("div", { className: "flex gap-2 flex-wrap" },
        h(Button, { variant: "ghost", size: "sm", onClick: function () { setFilter(""); } }, "All"),
        cats.map(function (c) {
          return h(Button, {
            key: c,
            variant: "ghost",
            size: "sm",
            onClick: function () { setFilter(c); },
          }, c);
        }),
      ),

      h("div", { className: "grid gap-3" },
        filtered.map(function (s) {
          return h(Card, {
            key: s.name,
            className: "cursor-pointer hover:border-primary/50 transition-colors",
            onClick: function () { onSelect(s.name); },
          },
            h(CardContent, { className: "p-4 flex items-start justify-between gap-2" },
              h("div", { className: "flex-1 min-w-0" },
                h("div", { className: "flex items-center gap-2 flex-wrap mb-1" },
                  h("span", { className: "font-medium text-sm truncate" }, s.name),
                  sourceBadge(s.source),
                  h(CategoryBadge, { cat: s.category }),
                ),
                s.description && h("p", { className: "text-xs text-muted-foreground line-clamp-2" }, s.description),
                s.tags && s.tags.length > 0 && h("div", { className: "flex gap-1 mt-1 flex-wrap" },
                  s.tags.slice(0, 6).map(function (t) {
                    return h(Badge, { key: t, variant: "secondary", className: "text-xs py-0 px-1.5" }, t);
                  }),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ── Skill Editor ──────────────────────────────────────────────────────────

  function SkillEditor(props) {
    var name = props.name;
    var onBack = props.onBack;
    var skillSt = useState(null);
    var setSkill = skillSt[1];
    var skill = skillSt[0];
    var loadingSt = useState(true);
    var setLoading = loadingSt[1];
    var loading = loadingSt[0];
    var errorSt = useState(null);
    var setError = errorSt[1];
    var error = errorSt[0];
var tabSt = useState("files");
    var setTab = tabSt[1];
    var tab = tabSt[0];
    var editModeSt = useState(false);
    var setEditMode = editModeSt[1];
    var editMode = editModeSt[0];
    var editContentSt = useState("");
    var setEditContent = editContentSt[1];
    var editContent = editContentSt[0];
    var patchOldSt = useState("");
    var setPatchOld = patchOldSt[1];
    var patchOld = patchOldSt[0];
    var patchNewSt = useState("");
    var setPatchNew = patchNewSt[1];
    var patchNew = patchNewSt[0];
    var savingSt = useState(false);
    var setSaving = savingSt[1];
    var saving = savingSt[0];
    var saveMsgSt = useState(null);
    var setSaveMsg = saveMsgSt[1];
    var saveMsg = saveMsgSt[0];
    var selectedFileSt = useState(null);
    var setSelectedFile = selectedFileSt[1];
    var selectedFile = selectedFileSt[0];
    var fileContentSt = useState("");
    var setFileContent = fileContentSt[1];
    var fileContent = fileContentSt[0];
    var fileEditModeSt = useState(false);
    var setFileEditMode = fileEditModeSt[1];
    var fileEditMode = fileEditModeSt[0];
    var fileSavingSt = useState(false);
    var setFileSaving = fileSavingSt[1];
    var fileSaving = fileSavingSt[0];
    var fileMsgSt = useState(null);
    var setFileMsg = fileMsgSt[1];
    var fileMsg = fileMsgSt[0];

    useEffect(function () {
      setLoading(true);
      setEditMode(false);
      setSaveMsg(null);
      // setFileEditMode(false); // Removed — don't reset edit mode when skill data refreshes
      setSelectedFile(null);
      apiGetSkill(name)
        .then(function (s) { setSkill(s); setEditContent(s.content || ""); setLoading(false); })
        .catch(function (e) { setError(String(e)); setLoading(false); });
    }, [name]);

    if (loading) return h("div", { className: "p-6 text-center text-muted-foreground" }, "Loading skill " + name + "…");
    if (error) return h("div", { className: "p-6 text-center text-destructive" }, "Error: " + error);
    if (!skill) return null;

    var readOnly = skill.source !== "user";

    return h("div", { className: "flex flex-col gap-4" },
      h("div", { className: "flex items-center gap-3" },
        h(Button, { variant: "ghost", size: "sm", onClick: onBack },
          h("svg", { xmlns: "http://www.w3.org/2000/svg", width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
            h("polyline", { points: "15 18 9 12 15 6" })
          ),
          " Back"
        ),
        h("div", { className: "flex-1" },
          h("h2", { className: "text-lg font-semibold" }, skill.name),
          h("div", { className: "flex items-center gap-2 mt-0.5" },
            sourceBadge(skill.source),
            h(CategoryBadge, { cat: skill.category }),
            !readOnly && h(Badge, { variant: "destructive", className: "text-xs" }, "editable"),
          ),
        ),
        !readOnly && h(Button, {
          variant: "destructive",
          size: "sm",
          onClick: function () {
            if (!window.confirm("Delete skill '" + name + "'? This cannot be undone.")) return;
            apiMutate(name, "remove", {}).then(onBack).catch(function (e) { setError(String(e)); });
          },
        }, "Delete skill"),
      ),

      saveMsg && h("div", {
        className: "text-sm px-3 py-2 rounded border " + (saveMsg.ok
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-destructive/10 border-destructive/30 text-destructive"
        )},
        saveMsg.msg,
      ),

      // Tab buttons — native div+Button
      h("div", { className: "flex gap-1 border-b pb-0" },
        h(Button, {
          size: "sm",
          variant: tab === "files" ? "default" : "ghost",
          onClick: function () { setTab("files"); }
        }, "Files"),
        h(Button, {
          size: "sm",
          variant: tab === "patch" ? "default" : "ghost",
          onClick: function () { setTab("patch"); }
        }, "Patch"),
        h(Button, {
          size: "sm",
          variant: tab === "info" ? "default" : "ghost",
          onClick: function () { setTab("info"); }
        }, "Info"),
      ),

      // Files tab
      tab === "patch" && h("div", { className: "pt-4" },
        readOnly
          ? h("p", { className: "text-xs text-muted-foreground" }, "Read-only skill.")
          : h("div", { className: "flex flex-col gap-3" },
              h("div", null,
                h(Label, { className: "text-xs mb-1 block" }, "Find this text:"),
                h("textarea", {
                  className: "w-full bg-muted border border-input rounded p-2 text-xs font-mono min-h-[80px] resize-y",
                  value: patchOldSt[0],
                  onChange: function (e) { setPatchOld(e.target.value); },
                  placeholder: "Paste the exact text to find…",
                  style: { fontFamily: "inherit" },
                }),
              ),
              h("div", null,
                h(Label, { className: "text-xs mb-1 block" }, "Replace with:"),
                h("textarea", {
                  className: "w-full bg-muted border border-input rounded p-2 text-xs font-mono min-h-[80px] resize-y",
                  value: patchNewSt[0],
                  onChange: function (e) { setPatchNew(e.target.value); },
                  placeholder: "New text (leave empty to delete matched text)",
                  style: { fontFamily: "inherit" },
                }),
              ),
              h(Button, {
                size: "sm",
                onClick: function () {
                  if (!patchOldSt[0]) return;
                  setSaving(true);
                  setSaveMsg(null);
                  apiMutate(name, "patch", { old_string: patchOldSt[0], new_string: patchNewSt[0] })
                    .then(function () {
                      setSaveMsg({ ok: true, msg: "Patch applied." });
                      setPatchOld("");
                      setPatchNew("");
                      return apiGetSkill(name);
                    })
                    .then(function (s) { setSkill(s); setEditContent(s.content || ""); setSaving(false); })
                    .catch(function (e) { setSaveMsg({ ok: false, msg: String(e) }); setSaving(false); });
                },
                disabled: saving || !patchOldSt[0],
              }, saving ? "Patching…" : "Apply patch"),
            ),
      ),

      // Files tab
      tab === "files" && h("div", { className: "pt-4 flex gap-4", style: { minHeight: "500px" } },
        // Column 1: file list
        h("div", { className: "w-56 shrink-0" },
          h("div", { className: "bg-muted/30 rounded p-3" },
            h("p", { className: "text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide" }, "Files"),
            h("ul", { className: "text-xs space-y-0.5" },
              skill.files.map(function (f) {
                var active = selectedFileSt[0] === f.path;
                return h("li", {
                  key: f.path,
                  className: cn(
                    "cursor-pointer px-2 py-1.5 rounded truncate transition-colors",
                    active ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted"
                  ),
                  onClick: function () {
                    setSelectedFile(f.path);
                    setFileEditMode(false);
                    setFileMsg(null);
                    setFileContent("");
                    // Auto-load file content for preview
                    var path = f.path;
                    setFileSaving(true);
                    apiReadFile(name, path)
                      .then(function (data) {
                        setFileContent(data.content || "");
                        setFileSaving(false);
                      })
                      .catch(function (e) {
                        setFileMsg({ ok: false, msg: String(e) });
                        setFileSaving(false);
                      });
                  },
                  title: f.path,
                }, f.path);
              }),
            ),
          ),
        ),

        // Column 2: content viewer/editor
        h("div", { className: "flex-1 min-w-0 flex flex-col" },
          !selectedFileSt[0]
            ? h("div", { className: "flex-1 flex items-center justify-center text-muted-foreground text-sm" },
                "Click a file to view its content"
              )
            : h("div", { className: "flex-1 flex flex-col" },
// Header row
                  h("div", { className: "flex items-center gap-2 mb-2" },
                    h("span", { className: "text-xs font-mono text-muted-foreground flex-1 truncate" }, selectedFileSt[0]),
                    !readOnly && h(Button, {
                    size: "xs",
                    variant: fileEditMode ? "default" : "outline",
                    onClick: function () {
                      if (fileEditMode) {
                        // Save — write file to disk
                        setFileSaving(true);
                        setFileMsg(null);
                        apiWriteFile(name, selectedFileSt[0], fileContentSt[0])
                          .then(function () {
                            setFileMsg({ ok: true, msg: "File saved." });
                            setFileEditMode(false);
                            setFileSaving(false);
                          })
                          .catch(function (e) {
                            setFileMsg({ ok: false, msg: String(e) });
                            setFileSaving(false);
                          });
                      } else {
                        // Enter edit mode — load file content first
                        var path = selectedFileSt[0];
                        console.log("[SkillsManager] Edit clicked, path=", path, "name=", name);
                        setFileSaving(true);
                        setFileMsg(null);
                        console.log("[SkillsManager] Calling apiReadFile...");
                        apiReadFile(name, path)
                          .then(function (data) {
                            console.log("[SkillsManager] READY, data content length:", data.content ? data.content.length : 0);
                            setFileContent(data.content || "");
                            console.log("[SkillsManager] Calling setFileEditMode(true)...");
                            setFileEditMode(true);
                            console.log("[SkillsManager] setFileEditMode(true) called");
                            setFileSaving(false);
                          })
                          .catch(function (e) {
                            console.log("[SkillsManager] READ ERROR:", e);
                            setFileMsg({ ok: false, msg: String(e) + " — check console (F12)" });
                            setFileSaving(false);
                          });
                      }
                    },
                    disabled: fileSaving,
                  }, fileEditMode ? (fileSaving ? "Saving…" : "Save") : (fileSaving ? "Loading…" : "Edit")),
                ),

                // Feedback message
                fileMsg && h("div", {
                  className: "text-xs px-2 py-1 rounded mb-2 " + (fileMsg.ok
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : "bg-destructive/10 border border-destructive/30 text-destructive"
                  )},
                  fileMsg.msg,
                ),

                // Read-only preview (when not editing)
                !fileEditMode && h("pre", {
                  className: "flex-1 text-xs bg-muted/50 rounded p-4 overflow-auto whitespace-pre-wrap font-mono",
                  style: { fontFamily: "inherit", minHeight: "300px" },
                }, fileContentSt[0] || "(empty)"),

                // Editable textarea (when in edit mode)
                fileEditMode && h("textarea", {
                  className: "flex-1 w-full bg-transparent border border-input rounded p-3 text-xs font-mono resize-y",
                  value: fileContentSt[0],
                  onChange: function (e) { setFileContent(e.target.value); },
                  style: { fontFamily: "inherit", minHeight: "300px" },
                }),
              ),
        ),
      ),

      // Info tab
      tab === "info" && h("div", { className: "pt-4" },
        h("dl", { className: "grid grid-cols-2 gap-4 text-xs" },
          h("div", null, h("dt", { className: "text-muted-foreground mb-1" }, "Name"), h("dd", { className: "font-medium" }, skill.name)),
          h("div", null, h("dt", { className: "text-muted-foreground mb-1" }, "Category"), h("dd", { className: "font-medium" }, skill.category || "—")),
          h("div", null, h("dt", { className: "text-muted-foreground mb-1" }, "Source"), h("dd", null, sourceBadge(skill.source))),
          h("div", null, h("dt", { className: "text-muted-foreground mb-1" }, "Tags"), h("dd", null, (skill.tags || []).join(", ") || "—" )),
          h("div", null, h("dt", { className: "text-muted-foreground mb-1" }, "Skill path"), h("dd", { className: "font-mono text-muted-foreground break-all" }, skill.skill_dir || "—" )),
        ),
      ),
    );
  }

  // ── Main App ──────────────────────────────────────────────────────────────

  function SkillsManagerApp() {
    var selectedSt = useState(null);
    var setSelected = selectedSt[1];
    var selected = selectedSt[0];

    return h("div", { className: "p-6 max-w-5xl mx-auto" },
      h("div", { className: "mb-6" },
        h("h1", { className: "text-xl font-bold mb-1" }, "Skills Manager"),
        h("p", { className: "text-sm text-muted-foreground" }, "View and edit your Hermes agent skills."),
      ),
      h(Separator, { className: "mb-6" }),
      selected
        ? h(SkillEditor, { name: selected, onBack: function () { setSelected(null); } })
        : h(SkillBrowser, { onSelect: function (name) { setSelected(name); } }),
    );
  }

  // ── Register ──────────────────────────────────────────────────────────────

  window.__HERMES_PLUGINS__.register("skills-manager", SkillsManagerApp);
})();
