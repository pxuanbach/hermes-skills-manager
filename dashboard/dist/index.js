/**
 * Hermes Skills Manager — Dashboard Plugin
 *
 * Plain IIFE, no build step. Uses window.__HERMES_PLUGIN_SDK__ for React +
 * shadcn primitives.
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
  var Badge = components.Badge;
  var Button = components.Button;
  var Input = components.Input;
  var Label = components.Label;
  var Select = components.Select;
  var SelectOption = components.SelectOption;
  var Separator = components.Separator;
  var hooks = SDK.hooks;
  var useState = hooks.useState;
  var useEffect = hooks.useEffect;
  var useMemo = hooks.useMemo;
  var utils = SDK.utils;
  var cn = utils.cn;
  var timeAgo = utils.timeAgo;

  // ── API client ────────────────────────────────────────────────────────────

  var API = "/api/plugins/skills-manager";

  function apiList() {
    return SDK.fetchJSON(API + "/skills");
  }

  function apiGetSkill(name) {
    return SDK.fetchJSON(API + "/skills/" + name);
  }

  function apiMutate(name, action, body) {
    return SDK.fetchJSON(API + "/skills/" + name, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, body)),
    });
  }

  function apiReadFile(name, path) {
    return SDK.fetchJSON(API + "/skills/" + name + "/files/" + path);
  }

  function apiWriteFile(name, path, content) {
    return SDK.fetchJSON(API + "/skills/" + name + "/files/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content }),
    });
  }

  function apiDeleteFile(name, path) {
    return SDK.fetchJSON(API + "/skills/" + name + "/files/" + path, {
      method: "DELETE",
    });
  }

  function apiUsage(name) {
    return SDK.fetchJSON(API + "/skills/" + name + "/usage").catch(function () { return null; });
  }

  // ── Source badge ─────────────────────────────────────────────────────────

  function sourceBadge(source) {
    var variant = "secondary";
    var label = source || "unknown";
    if (source === "user") { variant = "default"; label = "User"; }
    else if (source === "bundled") { variant = "outline"; label = "Bundled"; }
    return h(Badge, { variant: variant, className: "text-xs" }, label);
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

    if (loading[0]) return h("div", { className: "p-6 text-center text-muted-foreground" }, "Loading skills...");
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
          placeholder: "Search skills...",
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
          String(filtered.length) + " / " + String(skills[0].length) + " skills"
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

    // Files tab state
    var selectedFileSt = useState(null);
    var setSelectedFile = selectedFileSt[1];
    var selectedFile = selectedFileSt[0];
    var fileContentSt = useState("");
    var setFileContent = fileContentSt[1];
    var fileContent = fileContentSt[0];
    var fileEditModeSt = useState(false);
    var setFileEditMode = fileEditModeSt[1];
    var fileEditMode = fileEditModeSt[0];
    var fileLoadingSt = useState(false);
    var setFileLoading = fileLoadingSt[1];
    var fileLoading = fileLoadingSt[0];
    var fileErrorSt = useState(null);
    var setFileError = fileErrorSt[1];
    var fileError = fileErrorSt[0];
    var savingFileSt = useState(false);
    var setSavingFile = savingFileSt[1];
    var savingFile = savingFileSt[0];
    var fileMsgSt = useState(null);
    var setFileMsg = fileMsgSt[1];
    var fileMsg = fileMsgSt[0];

    // Content/Patch/Info tabs (simplified)
    var editModeSt = useState(false);
    var setEditMode = editModeSt[1];
    var editMode = editModeSt[0];
    var editContentSt = useState("");
    var patchOldSt = useState("");
    var patchNewSt = useState("");
    var savingSt = useState(false);
    var setSaving = savingSt[1];
    var saving = savingSt[0];
    var saveMsgSt = useState(null);
    var setSaveMsg = saveMsgSt[1];
    var saveMsg = saveMsgSt[0];
    var tabSt = useState("files");
    var setTab = tabSt[1];
    var tab = tabSt[0];
    var usageSt = useState(null);
    var setUsage = usageSt[1];
    var usage = usageSt[0];

    useEffect(function () {
      setLoading(true);
      setEditMode(false);
      saveMsgSt[1](null);
      setTab("files");
      setSelectedFile(null);
      setFileContent("");
      setFileEditMode(false);
      Promise.all([apiGetSkill(name), apiUsage(name)])
        .then(function (results) {
          var s = results[0];
          var u = results[1];
          setSkill(s);
          setEditContent(s.content || "");
          setUsage(u);
          setLoading(false);
        })
        .catch(function (e) { setError(String(e)); setLoading(false); });
    }, [name]);

    if (loading) return h("div", { className: "p-6 text-center text-muted-foreground" }, "Loading skill " + name + "...");
    if (error) return h("div", { className: "p-6 text-center text-destructive" }, "Error: " + error);
    if (!skill) return null;

    var readOnly = skill.source !== "user";

    // ── Load file content when file is selected ───────────────────────────

    function loadFile(path) {
      if (!path || fileLoadingSt[0]) return;
      setSelectedFile(path);
      setFileEditMode(false);
      setFileContent("");
      setFileError(null);
      setFileMsg(null);
      setFileLoading(true);
      apiReadFile(name, path)
        .then(function (data) {
          setFileContent(data.content || "");
          setFileLoading(false);
        })
        .catch(function (e) {
          setFileError(String(e));
          setFileLoading(false);
        });
    }

    // ── Tab button helper ───────────────────────────────────────────────

    function TabBtn(tabId, label) {
      return h(Button, {
        key: tabId,
        variant: tab === tabId ? "default" : "ghost",
        size: "sm",
        onClick: function () { setTab(tabId); },
      }, label);
    }

    // ── Files tab panel (2-column) ─────────────────────────────────────

    var filesPanel;

    if (!skill.files || skill.files.length === 0) {
      filesPanel = h("p", { className: "text-xs text-muted-foreground pt-4" }, "No files in this skill.");
    } else {
      filesPanel = h("div", { className: "flex gap-4", style: { minHeight: "420px" } },

        // Column 1: file list
        h("div", { className: "w-52 shrink-0" },
          h("div", { className: "bg-muted/30 rounded p-3" },
            h("ul", { className: "text-xs space-y-0.5" },
              skill.files.map(function (f) {
                var active = selectedFileSt[0] === f.path;
                return h("li", {
                  key: f.path,
                  className: cn(
                    "cursor-pointer px-2 py-1.5 rounded truncate transition-colors",
                    active ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted"
                  ),
                  onClick: function () { loadFile(f.path); },
                  title: f.path,
                }, f.path);
              }),
            ),
          ),
        ),

        // Column 2: file content viewer/editor
        h("div", { className: "flex-1 min-w-0 flex flex-col" },

          // Empty state
          !selectedFileSt[0] && h("div", {
            className: "flex-1 flex items-center justify-center text-muted-foreground text-sm"
          }, "Select a file to view its content"),

          // Loading state
          selectedFileSt[0] && fileLoadingSt[0] && h("div", {
            className: "flex-1 flex items-center justify-center text-muted-foreground text-sm"
          }, "Loading..."),

          // File loaded
          selectedFileSt[0] && !fileLoadingSt[0] && h("div", { className: "flex flex-col h-full" },

            // Toolbar
            h("div", { className: "flex items-center gap-2 mb-2" },
              h("span", { className: "text-xs font-mono text-muted-foreground flex-1 truncate" },
                selectedFileSt[0]
              ),
              !readOnly && h(Button, {
                size: "xs",
                variant: fileEditModeSt[0] ? "default" : "outline",
                onClick: function () {
                  if (fileEditModeSt[0]) {
                    setSavingFile(true);
                    fileMsgSt[1](null);
                    apiWriteFile(name, selectedFileSt[0], fileContentSt[0])
                      .then(function () {
                        fileMsgSt[1]({ ok: true, msg: "Saved." });
                        setFileEditMode(false);
                        setSavingFile(false);
                      })
                      .catch(function (e) {
                        fileMsgSt[1]({ ok: false, msg: String(e) });
                        setSavingFile(false);
                      });
                  } else {
                    setFileEditMode(true);
                  }
                },
                disabled: savingFileSt[0],
              }, fileEditModeSt[0] ? (savingFileSt[0] ? "Saving..." : "Save") : "Edit"),
              selectedFileSt[0] !== "SKILL.md" && !readOnly && h(Button, {
                size: "xs",
                variant: "outline",
                onClick: function () {
                  if (!window.confirm("Delete '" + selectedFileSt[0] + "'?")) return;
                  setSavingFile(true);
                  apiDeleteFile(name, selectedFileSt[0])
                    .then(function () {
                      setSelectedFile(null);
                      setFileContent("");
                      setFileEditMode(false);
                      return apiGetSkill(name);
                    })
                    .then(function (s) { setSkill(s); setSavingFile(false); })
                    .catch(function (e) {
                      fileMsgSt[1]({ ok: false, msg: String(e) });
                      setSavingFile(false);
                    });
                },
                disabled: savingFileSt[0],
              }, "Delete"),
            ),

            // Message
            fileMsgSt[0] && h("div", {
              className: "text-xs px-2 py-1 rounded mb-2 " + (fileMsgSt[0].ok
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
              )},
              fileMsgSt[0].msg,
            ),

            // Content
            fileEditModeSt[0]
              ? h("textarea", {
                  className: "flex-1 w-full bg-transparent border border-input rounded p-3 text-xs font-mono resize-y",
                  value: fileContentSt[0],
                  onChange: function (e) { setFileContent(e.target.value); },
                  style: { fontFamily: "inherit", minHeight: "320px" },
                })
              : h("pre", {
                  className: "flex-1 text-xs bg-muted/50 rounded p-4 overflow-auto whitespace-pre-wrap font-mono",
                  style: { fontFamily: "inherit", minHeight: "320px" },
                }, fileContentSt[0] || "(empty)"),
          ),
        ),
      );
    }

    // ── Content tab panel (read-only preview + edit mode for SKILL.md) ────

    var contentPanel = h("div", { className: "pt-4" },
      !readOnly && h(Button, {
        size: "sm",
        className: "mb-3",
        onClick: function () {
          if (editModeSt[0]) {
            setSaving(true);
            saveMsgSt[1](null);
            apiMutate(name, "edit", { content: editContentSt[0] })
              .then(function () {
                saveMsgSt[1]({ ok: true, msg: "Skill content saved." });
                setEditMode(false);
                setSaving(false);
                return apiGetSkill(name);
              })
              .then(function (s) { setSkill(s); })
              .catch(function (e) {
                saveMsgSt[1]({ ok: false, msg: String(e) });
                setSaving(false);
              });
          } else {
            setEditMode(true);
          }
        },
        disabled: savingSt[0],
      }, editModeSt[0] ? (savingSt[0] ? "Saving..." : "Save") : "Edit SKILL.md"),
      readOnly && h("p", { className: "text-xs text-muted-foreground mb-3" }, "Read-only (bundled skill)"),
      h("pre", {
        className: "text-xs bg-muted/50 rounded p-4 overflow-auto max-h-[60vh] whitespace-pre-wrap font-mono",
        style: { fontFamily: "inherit" },
      }, skill.content || ""),
    );

    // ── Patch tab (old_string / new_string) ─────────────────────────────

    var patchPanel = h("div", { className: "pt-4" },
      readOnly
        ? h("p", { className: "text-xs text-muted-foreground" }, "Read-only skill.")
        : h("div", { className: "flex flex-col gap-3" },
            h("div", null,
              h(Label, { className: "text-xs mb-1 block" }, "Find this text:"),
              h("textarea", {
                className: "w-full bg-muted border border-input rounded p-2 text-xs font-mono min-h-[80px] resize-y",
                value: patchOldSt[0],
                onChange: function (e) { patchOldSt[1](e.target.value); },
                placeholder: "Exact text to find...",
                style: { fontFamily: "inherit" },
              }),
            ),
            h("div", null,
              h(Label, { className: "text-xs mb-1 block" }, "Replace with:"),
              h("textarea", {
                className: "w-full bg-muted border border-input rounded p-2 text-xs font-mono min-h-[80px] resize-y",
                value: patchNewSt[0],
                onChange: function (e) { patchNewSt[1](e.target.value); },
                placeholder: "Replacement text (leave empty to delete)",
                style: { fontFamily: "inherit" },
              }),
            ),
            h(Button, {
              size: "sm",
              onClick: function () {
                if (!patchOldSt[0]) return;
                setSaving(true);
                saveMsgSt[1](null);
                apiMutate(name, "patch", { old_string: patchOldSt[0], new_string: patchNewSt[0] })
                  .then(function () {
                    saveMsgSt[1]({ ok: true, msg: "Patch applied." });
                    patchOldSt[1]("");
                    patchNewSt[1]("");
                    return apiGetSkill(name);
                  })
                  .then(function (s) { setSkill(s); setSaving(false); })
                  .catch(function (e) {
                    saveMsgSt[1]({ ok: false, msg: String(e) });
                    setSaving(false);
                  });
              },
              disabled: savingSt[0] || !patchOldSt[0],
            }, savingSt[0] ? "Patching..." : "Apply patch"),
        ),
    );

    // ── Info tab ─────────────────────────────────────────────────────────

    var infoPanel = h("div", { className: "pt-4" },
      h("dl", { className: "grid grid-cols-2 gap-4 text-xs" },
        h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Name"),
          h("dd", { className: "font-medium" }, skill.name)
        ),
        h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Category"),
          h("dd", { className: "font-medium" }, skill.category || "-")
        ),
        h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Source"),
          h("dd", null, sourceBadge(skill.source))
        ),
        skills[0] && h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Tags"),
          h("dd", null, (skill.tags || []).join(", ") || "-")
        ),
        h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Skill path"),
          h("dd", { className: "font-mono text-muted-foreground break-all" }, skill.skill_dir || "-")
        ),
        usage && h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Used"),
          h("dd", null, String(usage.use_count || 0) + " times")
        ),
        usage && usage.last_activity_at && h("div", null,
          h("dt", { className: "text-muted-foreground mb-1" }, "Last activity"),
          h("dd", null, timeAgo(new Date(usage.last_activity_at).getTime() / 1000))
        ),
      ),
    );

    var currentTabContent;
    if (tab === "files") currentTabContent = filesPanel;
    else if (tab === "content") currentTabContent = contentPanel;
    else if (tab === "patch") currentTabContent = patchPanel;
    else currentTabContent = infoPanel;

    return h("div", { className: "flex flex-col gap-4" },

      // Header row
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
            apiMutate(name, "delete", {}).then(function () { onBack(); });
          },
        }, "Delete skill"),
      ),

      // Feedback message
      saveMsgSt[0] && h("div", {
        className: "text-sm px-3 py-2 rounded border " + (saveMsgSt[0].ok
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-destructive/10 border-destructive/30 text-destructive"
        )},
        saveMsgSt[0].msg,
      ),

      // Tab buttons
      h("div", { className: "flex gap-1 border-b" },
        TabBtn("files", "Files"),
        TabBtn("content", "Content"),
        !readOnly && TabBtn("patch", "Patch"),
        TabBtn("info", "Info"),
      ),

      // Tab content
      currentTabContent,
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
