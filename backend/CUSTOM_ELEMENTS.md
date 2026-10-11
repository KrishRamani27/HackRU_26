# Manual drawing: frontend and builder contract

Custom elements are editable strokes or closed shapes. This backend saves their points,
styles and transforms; no Gemini call is needed. The frontend must still build the pen,
selection, move/resize and layer controls. The builder must render these elements and
include them in export. This document is the exact backend contract for that work.

Shared TypeScript definitions are in `contracts/custom-elements.ts`.
Python validation is in `app/custom_schemas.py`. Routes are in `app/custom_routes.py`.
The AI lead's `schemas.py`, `ai_schemas.py` and prompts are unchanged by this feature.

## Where elements go

`custom_elements` is a top-level field on a **saved design**, alongside `spec`.
Do not add it inside `spec` or send it to `/analyze`, `/command` or `/suggestions`.
AI outputs still use the existing dress contract.

```json
{
  "name": "My dress",
  "spec": {},
  "custom_elements": [
    {
      "id": "crease-1",
      "group_id": null,
      "name": "Sleeve crease",
      "type": "stroke",
      "parent_part": "right_sleeve",
      "points": [[280, 120], [290, 135], [285, 150]],
      "closed": false,
      "stroke": "#222222",
      "stroke_width": 2,
      "fill": null,
      "pattern": "solid",
      "transform": {
        "x": 0, "y": 0, "scale_x": 1, "scale_y": 1, "rotation": 0
      },
      "visible": true,
      "layer_order": 1
    }
  ]
}
```

Send this to `POST /designs`. `{}` uses the default example dress; send the real full
spec in your app. Existing clients that do not send `custom_elements` still work.
On `PUT /designs/{id}`, omission or null **preserves** the current elements; an explicit
`[]` clears them. A nonempty array replaces the entire list, so include all elements
you want to keep. All reads return the stored list, including `/designs` and version history.

## Coordinate and rendering rules

- Points use the existing **400 × 600 SVG viewBox**, regardless of browser zoom.
  The frontend converts screen pointer positions into these canvas coordinates.
- Each point is `[x, y]`. A stroke needs at least 2 points. A closed shape needs at least 3.
- Apply scale, then rotation in degrees around canvas origin `(0, 0)`, then translation.
  The SVG group transform is `translate(x y) rotate(rotation) scale(scale_x scale_y)`.
  To resize about a selection's center, the frontend adjusts translation too.
- `parent_part` is a label pointing to one of the eight existing dress groups, or null.
  Points are **not** relative to that part. Do not automatically apply the part's mirror
  transform to them. The backend does not reposition points when a sleeve changes.
  Any follow-parent behavior must be computed by the frontend/builder and saved explicitly.
- Render visible custom groups on top of the generated dress. Sort by `layer_order`,
  lowest first. Equal orders use stored list order. Ordering between custom shapes and
  individual generated dress parts is not part of this first version.
- Use each element ID as its identity. For exported SVG groups, prefix it with `custom_`
  to avoid collisions with built-in part IDs.
- `closed=true` closes the stroke into a shape. Only closed shapes may have a fill.
  Denim/plaid/floral require a filled shape; the builder handles rendering the pattern.
- Points are the editable source. Preserve them when generating previews or SVG strings.
  Rebuilding the dress must use the latest `spec` **and** the same `custom_elements` list.
- Use safe SVG attribute construction/escaping. Do not insert names as raw SVG markup.

Limits: 200 elements per design, 5,000 points per element, finite coordinates between
-10,000 and 10,000, positive scales up to 100, rotation -360 to 360, stroke width above
0 and at most 100, nonnegative integer layer order up to 10,000. Colors are 6-digit hex.
Element IDs are 1–64 letters, numbers, underscores or hyphens; omission generates a UUID.
IDs must be unique inside each design.
`group_id` is optional/null, with the same 1–64 character rules as `id`. Several
strokes may share a group ID; each stroke still has its own unique element ID.
PATCH `group_id` to assign a group or null to ungroup. Multi-select behavior belongs
to the frontend; the backend stores the membership and includes it in version history.

## Endpoints

Same `X-API-Key` rule as other routes. All element mutations below return the complete
updated design, including `custom_elements` and its new `version`.

| Route | Body | Behavior |
| --- | --- | --- |
| `GET /designs/{id}/elements` | None | Current custom-element array |
| `POST /designs/{id}/elements` | Custom element; name and points required | Add one element, return design (201) |
| `PUT /designs/{id}/elements/{element_id}` | Complete element with matching ID | Replace one element |
| `PATCH /designs/{id}/elements/{element_id}` | Changed fields | Edit one element; partial transform supported |
| `DELETE /designs/{id}/elements/{element_id}` | None | Remove one element, return design (200) |
| `POST /designs/{id}/versions/{version}/restore` | None | Restore spec and elements as a new version |
| `POST /custom-parts` | `{name, elements: [...]}` | Save one or several strokes as a reusable template (201) |
| `GET /custom-parts` | None | Templates; optional limit/offset |
| `GET /custom-parts/{part_id}` | None | One template |
| `PUT /custom-parts/{part_id}` | `{name, elements: [...]}` | Update template, existing instances unchanged |
| `DELETE /custom-parts/{part_id}` | None | Delete template (204), existing instances unchanged |
| `POST /designs/{id}/elements/from-part/{part_id}` | `{}` or `{transform, layer_order}` | Insert an independent copy with a new ID (201) |

Element mutations, design PUT and version restore accept `?expected_version=N`.
Send the last version you loaded. A stale version returns 409; reload before retrying.
This is recommended to avoid overwriting edits from another tab. Simultaneous database
writes also use version checks. No automatic merging of competing edits is performed.
Duplicate element IDs return 409. Invalid data returns 422. Missing records return 404.

### Move/resize example

For `PATCH /designs/{id}/elements/crease-1?expected_version=2`:

```json
{
  "transform": {"x": 20, "scale_x": 1.5},
  "stroke": "#1f2a44",
  "layer_order": 3
}
```

This changes x position, horizontal scale, color and layer order. Other transform
fields keep their old values. `fill: null` clears a fill, and `parent_part: null`
removes its attachment label. Null is invalid for fields such as name or transform.

## Save a bow made from several strokes

Send only the selected strokes; they do not need to include every member of a group.
For `POST /custom-parts`:

```json
{
  "name": "My bow",
  "elements": [
    {"id": "bow-left", "group_id": "bow-1", "name": "Left", "points": [[100,100],[120,110]]},
    {"id": "bow-center", "group_id": "bow-1", "name": "Center", "points": [[120,110],[125,110]]},
    {"id": "bow-right", "group_id": "bow-1", "name": "Right", "points": [[125,110],[145,100]]}
  ]
}
```

Library responses always contain `elements`, an array of 1–200 strokes. Empty lists
and duplicate element IDs are rejected. For backward compatibility, requests may
still send legacy `{name, element}` instead. Sending both fields is rejected.
Single-element responses also include legacy `element`; group responses do not.
Existing database rows holding one stroke still work; no database migration is needed
for this update. New lists use the same JSON column.

To reuse, POST `{}` to `/designs/{id}/elements/from-part/{part_id}`. All strokes are
inserted atomically, with one new design version. Each element receives a new ID.
Each non-null group ID is remapped to a fresh ID, keeping group relationships within
the copy and separating it from earlier copies. Ungrouped strokes stay ungrouped.
Stored points/transforms are preserved. A capacity failure inserts none of the strokes.

`layer_order` on reuse sets the lowest layer; relative layer offsets are preserved.
For grouped templates, omit `transform`: replacing every stroke's transform could
break their layout, so it is rejected with 422. Frontend computes group moves/resizes
and saves updated member transforms via design PUT (with `expected_version`). The
existing transform override still works for single-stroke templates.

## Persistence, history and existing databases

Points/styles/transforms are JSON in Tiger Cloud PostgreSQL (or SQLite locally).
Every design update or element mutation saves both `spec` and `custom_elements` in a
new version. Restore appends a version rather than deleting history. Restore does
not change the current design name or sketch image reference.
Browser undo/redo before saving remains frontend work; these routes support saved history.

Startup automatically adds `custom_elements` to existing `designs` and `design_versions`
tables with an empty list default, and creates `custom_parts`. Old sketches, parts and
designs stay intact. PostgreSQL startup migrations are serialized across workers.
The configured database account needs permission to add columns/create tables.
The SQLite upgrade is tested. Tiger/PostgreSQL live upgrade still needs cloud testing.

Preview images may use the existing `/assets` endpoint and Google Cloud Storage.
Saving a PNG alone does not save editable custom elements. The existing `/parts`
library stays available for predefined dress settings; manual templates use `/custom-parts`.

## Current scope

This backend supports storage and editing of manual point data. It does not draw SVG,
modify a generated collar's control points, auto-fit a stroke to changing dress geometry,
or add bitmap brushes. Frontend and builder implement the visible drawing experience.
