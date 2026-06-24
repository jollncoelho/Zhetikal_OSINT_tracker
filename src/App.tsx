<Sidebar
        cases={cases}
        activeCaseId={activeCaseId}
        onCreateCase={createCase}
        onSwitchCase={switchCase}
        onCloseCase={() => { 
          if (closeCase) closeCase(); 
          setNotePanelOpen(false); 
          setSelectedNodeId(null); 
        }}
        onDeleteCase={deleteCase}
        onUpdateCase={updateCase}
        onAddEntity={handleAddEntity}
        onSaveProgress={saveProgress}
        onExport={() => {
          if (exportCase) exportCase();
        }}
        onExportPdf={async () => {
          if (exportPdfFn) await exportPdfFn();
        }}
        onExportPng={async () => {
          if (exportPngFn) await exportPngFn();
        }}
        onImport={importCase}
        onClearCanvas={clearCanvas}
      />