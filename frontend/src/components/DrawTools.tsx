import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { SHAPE_KINDS, type ShapeKind } from "../draw/shapes";
import type { EraserMode } from "../draw/eraser";
import type { CanvasTool } from "./CanvasStage";
import {
  CheckIcon,
  ChevronDownIcon,
  CursorIcon,
  EllipseIcon,
  EraserIcon,
  HeartIcon,
  LineIcon,
  PenIcon,
  RectangleIcon,
  StarIcon,
  TriangleIcon,
} from "./Icons";

const SHAPE_ICONS: Record<ShapeKind, () => ReactNode> = {
  rectangle: () => <RectangleIcon />,
  ellipse: () => <EllipseIcon />,
  triangle: () => <TriangleIcon />,
  star: () => <StarIcon />,
  heart: () => <HeartIcon />,
};

interface Props {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  shape: ShapeKind;
  onShapeChange: (shape: ShapeKind) => void;
  eraserMode: EraserMode;
  onEraserModeChange: (mode: EraserMode) => void;
  /** False until a flat is on the canvas. */
  enabled: boolean;
  /** False once the design holds as many drawn elements as the contract allows. */
  canDraw: boolean;
}

/**
 * The drawing tools as one segmented control: select, pen, line, shapes (with a small menu to pick
 * the shape) and eraser (with a Partial toggle while it is active). Shortcuts are in the tooltips.
 */
export function DrawTools({ tool, onToolChange, shape, onShapeChange, eraserMode, onEraserModeChange, enabled, canDraw }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const full = "The drawing limit (200 elements) is reached";

  useEffect(() => {
    if (!enabled) setMenuOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!menuOpen) return;
    itemRefs.current[SHAPE_KINDS.findIndex((s) => s.kind === shape)]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen, shape]);

  const pick = (kind: ShapeKind) => {
    onShapeChange(kind);
    onToolChange("shapes");
    setMenuOpen(false);
    caretRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => !!el);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") items[(index + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(index - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Home") items[0]?.focus();
    else if (e.key === "End") items[items.length - 1]?.focus();
    else if (e.key === "Escape") {
      setMenuOpen(false);
      caretRef.current?.focus();
    } else if (e.key === "Tab") setMenuOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault(); // Escape here closes the menu only, not the tool
  };

  const button = (id: CanvasTool, label: string, key: string, hint: string, icon: ReactNode, drawing = false) => (
    <button
      type="button"
      className="icon-btn tool-btn"
      aria-label={`${label} tool`}
      aria-pressed={tool === id}
      aria-keyshortcuts={key}
      title={drawing && !canDraw ? full : `${label} (${key}): ${hint}`}
      disabled={!enabled || (drawing && !canDraw)}
      onClick={() => onToolChange(id)}
    >
      {icon}
    </button>
  );

  const shapeName = SHAPE_KINDS.find((s) => s.kind === shape)!.label;

  return (
    <div className="draw-tools" ref={rootRef}>
      <div className="tools" role="group" aria-label="Drawing tools">
        {button("select", "Select", "V", "click or drag to select, move and resize", <CursorIcon />)}
        {button("pen", "Pen", "P", "drag to draw freehand", <PenIcon />, true)}
        {button("line", "Line", "L", "drag for a straight line, Shift snaps to 45°", <LineIcon />, true)}
        <span className={`tool-split${tool === "shapes" ? " is-active" : ""}`}>
          {button("shapes", shapeName, "S", "drag to draw, Shift keeps proportions", SHAPE_ICONS[shape](), true)}
          <button
            ref={caretRef}
            type="button"
            className="icon-btn tool-caret"
            aria-label="Choose a shape"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            title="Choose a shape"
            disabled={!enabled || !canDraw}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <ChevronDownIcon width={12} height={12} />
          </button>
        </span>
        {button("eraser", "Eraser", "E", eraserMode === "partial" ? "drag to erase parts of lines" : "drag to erase whole drawings", <EraserIcon />)}
      </div>
      {tool === "eraser" && (
        <button
          type="button"
          className="btn btn--ghost btn--sm eraser-mode"
          aria-pressed={eraserMode === "partial"}
          title={eraserMode === "partial"
            ? "Partial: erase only what you drag over (closed shapes are erased whole). Click for whole elements."
            : "Whole: erase every drawing you touch. Click to erase only parts of lines."}
          onClick={() => onEraserModeChange(eraserMode === "partial" ? "whole" : "partial")}
        >
          Partial
        </button>
      )}
      {menuOpen && (
        <div id={menuId} className="export__menu draw-tools__menu" role="menu" aria-label="Shape" onKeyDown={onMenuKeyDown}>
          {SHAPE_KINDS.map((s, i) => (
            <button
              key={s.kind}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitemradio"
              aria-checked={s.kind === shape}
              className="export__item draw-tools__item"
              onClick={() => pick(s.kind)}
            >
              {SHAPE_ICONS[s.kind]()}
              <span className="export__item-label">{s.label}</span>
              {s.kind === shape && <CheckIcon width={14} height={14} className="draw-tools__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
