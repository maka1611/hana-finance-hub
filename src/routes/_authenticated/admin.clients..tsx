
function DocumentCard({
  title, icon, photoUrl, onUpload, children,
}: {
  title: string;
  icon: React.ReactNode;
  photoUrl: string | null | undefined;
  onUpload: (f: File) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl ring-1 ring-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold">{title}</h2>
        </div>
        {photoUrl && (
          <a
            href={photoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="size-3" /> Открыть
          </a>
        )}
      </div>
      {photoUrl ? (
        <a href={photoUrl} target="_blank" rel="noreferrer" className="block">
          <img
            src={photoUrl}
            alt={title}
            className="w-full h-40 object-cover rounded-lg ring-1 ring-border"
          />
        </a>
      ) : (
        <div className="h-40 rounded-lg ring-1 ring-dashed ring-border flex items-center justify-center text-xs text-muted-foreground">
          Фото не загружено
        </div>
      )}
      <label className="block">
        <span className="sr-only">Загрузить</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
          id={`up-${title}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.getElementById(`up-${title}`)?.click()}
        >
          <Upload className="size-4" /> {photoUrl ? "Заменить фото" : "Загрузить фото"}
        </Button>
      </label>
      <div className="space-y-3 pt-2 border-t border-border">{children}</div>
    </div>
  );
}
