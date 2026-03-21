import {
  setWindowCursor,
  startWindowResize,
} from "../tauri/windowChrome";

type ResizeHandleDirection =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

const resizeHandles: Array<{
  direction: ResizeHandleDirection;
  cursor:
    | "nResize"
    | "neResize"
    | "eResize"
    | "seResize"
    | "sResize"
    | "swResize"
    | "wResize"
    | "nwResize";
}> = [
  { direction: "North", cursor: "nResize" },
  { direction: "NorthEast", cursor: "neResize" },
  { direction: "East", cursor: "eResize" },
  { direction: "SouthEast", cursor: "seResize" },
  { direction: "South", cursor: "sResize" },
  { direction: "SouthWest", cursor: "swResize" },
  { direction: "West", cursor: "wResize" },
  { direction: "NorthWest", cursor: "nwResize" },
];

export const TauriResizeHandles = () => {
  return (
    <div className="tauri-resize-handles" aria-hidden="true">
      {resizeHandles.map(({ direction, cursor }) => (
        <div
          key={direction}
          className={`tauri-resize-handle tauri-resize-handle--${direction}`}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void startWindowResize(direction);
          }}
          onMouseEnter={() => {
            void setWindowCursor(cursor);
          }}
          onMouseLeave={() => {
            void setWindowCursor("default");
          }}
        />
      ))}
    </div>
  );
};
