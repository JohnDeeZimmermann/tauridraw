import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import DialogActionButton from "@excalidraw/excalidraw/components/DialogActionButton";

type DirtyTabDialogProps = {
  documentName: string;
  isSaving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export const DirtyTabDialog = ({
  documentName,
  isSaving = false,
  onSave,
  onDiscard,
  onCancel,
}: DirtyTabDialogProps) => {
  return (
    <Dialog
      size="small"
      title="Save changes before closing?"
      onCloseRequest={onCancel}
      closeOnClickOutside={false}
      className="dirty-tab-dialog"
    >
      <div className="dirty-tab-dialog__body">
        <p className="dirty-tab-dialog__text">
          <strong>{documentName}</strong> has unsaved changes.
        </p>
        <div className="dirty-tab-dialog__actions">
          <DialogActionButton label="Cancel" onClick={onCancel} />
          <DialogActionButton
            label="Don't Save"
            actionType="danger"
            onClick={onDiscard}
            disabled={isSaving}
          />
          <DialogActionButton
            label="Save"
            actionType="primary"
            onClick={onSave}
            isLoading={isSaving}
          />
        </div>
      </div>
    </Dialog>
  );
};
