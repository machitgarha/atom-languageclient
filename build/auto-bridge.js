Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = undefined;

var _child_process = require('child_process');

var cp = _interopRequireWildcard(_child_process);

var _languageclientV = require('./protocol/languageclient-v2');

var ls = _interopRequireWildcard(_languageclientV);

var _vscodeJsonrpc = require('vscode-jsonrpc');

var rpc = _interopRequireWildcard(_vscodeJsonrpc);

var _consoleLogger = require('./loggers/console-logger');

var _consoleLogger2 = _interopRequireDefault(_consoleLogger);

var _nullLogger = require('./loggers/null-logger');

var _nullLogger2 = _interopRequireDefault(_nullLogger);

var _autocompleteBridge = require('./bridges/autocomplete-bridge');

var _autocompleteBridge2 = _interopRequireDefault(_autocompleteBridge);

var _documentSyncBridge = require('./bridges/document-sync-bridge');

var _documentSyncBridge2 = _interopRequireDefault(_documentSyncBridge);

var _formatCodeBridge = require('./bridges/format-code-bridge');

var _formatCodeBridge2 = _interopRequireDefault(_formatCodeBridge);

var _linterBridge = require('./bridges/linter-bridge');

var _linterBridge2 = _interopRequireDefault(_linterBridge);

var _notificationsBridge = require('./bridges/notifications-bridge');

var _notificationsBridge2 = _interopRequireDefault(_notificationsBridge);

var _nuclideDefinitionBridge = require('./bridges/nuclide-definition-bridge');

var _nuclideDefinitionBridge2 = _interopRequireDefault(_nuclideDefinitionBridge);

var _nuclideFindReferencesBridge = require('./bridges/nuclide-find-references-bridge');

var _nuclideFindReferencesBridge2 = _interopRequireDefault(_nuclideFindReferencesBridge);

var _nuclideHyperclickBridge = require('./bridges/nuclide-hyperclick-bridge');

var _nuclideHyperclickBridge2 = _interopRequireDefault(_nuclideHyperclickBridge);

var _nuclideOutlineViewBridge = require('./bridges/nuclide-outline-view-bridge');

var _nuclideOutlineViewBridge2 = _interopRequireDefault(_nuclideOutlineViewBridge);

var _atom = require('atom');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

let AutoBridge = class AutoBridge {
  constructor() {
    this._disposable = new _atom.CompositeDisposable();
  }

  getName() {
    throw "Must set name field when extending AutoBridge";
  }
  getGrammarScopes() {
    throw "Must set grammarScopes field when extending AutoBridge";
  }

  activate() {
    this.logger = atom.config.get('core.debugLSP') ? new _consoleLogger2.default(this.getName()) : new _nullLogger2.default();
    this.startServer();
  }

  deactivate() {
    this._disposable.dispose();

    if (this._lc) {
      this._lc.shutdown();
    }

    if (this._process != null) {
      this._process.kill();
      this._process = null;
    };
  }

  startServer() {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (_this._process != null) return;

      _this._process = yield _this.startServerProcess();

      const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(_this._process.stdout), new rpc.StreamMessageWriter(_this._process.stdin), { error: function (m) {
          _this.logger.error(m);
        } });

      _this._lc = new ls.LanguageClientV2(connection, _this.logger);
      _this._lc.onLogMessage(function (m) {
        return _this.logger.log(['Log', m]);
      });

      const initializeResponse = yield _this._lc.initialize(_this.getInitializeParams());
      _this.bridgeCapabilities(initializeResponse.capabilities);
      _this.postInitialization(initializeResponse);
    })();
  }

  startServerProcess() {
    throw "Must override startServerProcess to start the language server process when extending AutoBridge";
  }

  bridgeCapabilities(capabilities) {
    this.linter = new _linterBridge2.default(this._lc);
    if (capabilities.completionProvider) {
      this.autoComplete = new _autocompleteBridge2.default(this._lc);
    }
    if (capabilities.documentSymbolProvider) {
      this.outlineView = new _nuclideOutlineViewBridge2.default(this._lc, this.getName());
    }
    if (capabilities.definitionProvider) {
      this.definitions = new _nuclideDefinitionBridge2.default(this._lc);
      this.hyperclick = new _nuclideHyperclickBridge2.default(this._lc);
    }
    if (capabilities.referencesProvider) {
      this.findReferences = new _nuclideFindReferencesBridge2.default(this._lc);
    }

    new _notificationsBridge2.default(this._lc, this.getName());

    if (capabilities.textDocumentSync) {
      this._disposable.add(new _documentSyncBridge2.default(this._lc, capabilities.textDocumentSync));
    }
    if (capabilities.documentRangeFormattingProvider || capabilities.documentFormattingProvider) {
      this._disposable.add(new _formatCodeBridge2.default(this._lc, capabilities.documentRangeFormattingProvider === true, capabilities.documentFormattingProvider === true));
    }
  }

  postInitialization(InitializationResult) {}

  provideOutlines() {
    return {
      name: this.getName(),
      grammarScopes: this.getGrammarScopes(),
      priority: 1,
      getOutline: this.getOutline.bind(this)
    };
  }

  getOutline(editor) {
    return this.outlineView != null ? this.outlineView.getOutline(editor) : Promise.resolve(null);
  }

  provideLinter() {
    return {
      name: this.getName(),
      grammarScopes: this.getGrammarScopes(),
      scope: 'project',
      lintOnFly: true,
      lint: this.provideLinting.bind(this)
    };
  }

  provideLinting(editor) {
    return this.linter != null ? this.linter.provideDiagnostics() : Promise.resolve([]);
  }

  provideAutocomplete() {
    return {
      selector: '.source',
      excludeLowerPriority: false,
      getSuggestions: this.provideSuggestions.bind(this)
    };
  }

  provideSuggestions(request) {
    return this.autoComplete != null ? this.autoComplete.provideSuggestions(request) : Promise.resolve([]);
  }

  provideDefinitions() {
    return {
      name: this.getName(),
      priority: 20,
      grammarScopes: this.getGrammarScopes(),
      getDefinition: this.getDefinition.bind(this),
      getDefinitionById: this.getDefinitionById.bind(this)
    };
  }

  getDefinition(editor, point) {
    return this.definitions != null ? this.definitions.getDefinition(editor, point) : Promise.resolve(null);
  }

  getDefinitionById(filename, id) {
    return Promise.resolve(null); // TODO: Is this needed?
  }

  provideFindReferences() {
    return {
      isEditorSupported: editor => true, // TODO: Grammar-select/extension based?
      findReferences: this.getReferences.bind(this)
    };
  }

  getReferences(editor, point) {
    return this.findReferences != null ? this.findReferences.getReferences(editor, point, this.getProjectRoot()) : Promise.resolve(null);
  }

  provideHyperclick() {
    return {
      priority: 20,
      providerName: this.getName(),
      getSuggestion: this.getHyperclickSuggestion.bind(this)
    };
  }

  getHyperclickSuggestion(editor, point) {
    return this.hyperclick != null ? this.hyperclick.getSuggestion(editor, point) : Promise.resolve(null);
  }

  getProjectRoot() {
    const rootDirs = atom.project.getDirectories();
    return rootDirs.length > 0 ? rootDirs[0].path : null;
  }

  getInitializeParams() {
    return {
      processId: process.pid,
      capabilities: {},
      rootPath: this.getProjectRoot()
    };
  }
};
exports.default = AutoBridge;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2xpYi9hdXRvLWJyaWRnZS5qcyJdLCJuYW1lcyI6WyJjcCIsImxzIiwicnBjIiwiQXV0b0JyaWRnZSIsIl9kaXNwb3NhYmxlIiwiZ2V0TmFtZSIsImdldEdyYW1tYXJTY29wZXMiLCJhY3RpdmF0ZSIsImxvZ2dlciIsImF0b20iLCJjb25maWciLCJnZXQiLCJzdGFydFNlcnZlciIsImRlYWN0aXZhdGUiLCJkaXNwb3NlIiwiX2xjIiwic2h1dGRvd24iLCJfcHJvY2VzcyIsImtpbGwiLCJzdGFydFNlcnZlclByb2Nlc3MiLCJjb25uZWN0aW9uIiwiY3JlYXRlTWVzc2FnZUNvbm5lY3Rpb24iLCJTdHJlYW1NZXNzYWdlUmVhZGVyIiwic3Rkb3V0IiwiU3RyZWFtTWVzc2FnZVdyaXRlciIsInN0ZGluIiwiZXJyb3IiLCJtIiwiTGFuZ3VhZ2VDbGllbnRWMiIsIm9uTG9nTWVzc2FnZSIsImxvZyIsImluaXRpYWxpemVSZXNwb25zZSIsImluaXRpYWxpemUiLCJnZXRJbml0aWFsaXplUGFyYW1zIiwiYnJpZGdlQ2FwYWJpbGl0aWVzIiwiY2FwYWJpbGl0aWVzIiwicG9zdEluaXRpYWxpemF0aW9uIiwibGludGVyIiwiY29tcGxldGlvblByb3ZpZGVyIiwiYXV0b0NvbXBsZXRlIiwiZG9jdW1lbnRTeW1ib2xQcm92aWRlciIsIm91dGxpbmVWaWV3IiwiZGVmaW5pdGlvblByb3ZpZGVyIiwiZGVmaW5pdGlvbnMiLCJoeXBlcmNsaWNrIiwicmVmZXJlbmNlc1Byb3ZpZGVyIiwiZmluZFJlZmVyZW5jZXMiLCJ0ZXh0RG9jdW1lbnRTeW5jIiwiYWRkIiwiZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdQcm92aWRlciIsImRvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyIiwiSW5pdGlhbGl6YXRpb25SZXN1bHQiLCJwcm92aWRlT3V0bGluZXMiLCJuYW1lIiwiZ3JhbW1hclNjb3BlcyIsInByaW9yaXR5IiwiZ2V0T3V0bGluZSIsImJpbmQiLCJlZGl0b3IiLCJQcm9taXNlIiwicmVzb2x2ZSIsInByb3ZpZGVMaW50ZXIiLCJzY29wZSIsImxpbnRPbkZseSIsImxpbnQiLCJwcm92aWRlTGludGluZyIsInByb3ZpZGVEaWFnbm9zdGljcyIsInByb3ZpZGVBdXRvY29tcGxldGUiLCJzZWxlY3RvciIsImV4Y2x1ZGVMb3dlclByaW9yaXR5IiwiZ2V0U3VnZ2VzdGlvbnMiLCJwcm92aWRlU3VnZ2VzdGlvbnMiLCJyZXF1ZXN0IiwicHJvdmlkZURlZmluaXRpb25zIiwiZ2V0RGVmaW5pdGlvbiIsImdldERlZmluaXRpb25CeUlkIiwicG9pbnQiLCJmaWxlbmFtZSIsImlkIiwicHJvdmlkZUZpbmRSZWZlcmVuY2VzIiwiaXNFZGl0b3JTdXBwb3J0ZWQiLCJnZXRSZWZlcmVuY2VzIiwiZ2V0UHJvamVjdFJvb3QiLCJwcm92aWRlSHlwZXJjbGljayIsInByb3ZpZGVyTmFtZSIsImdldFN1Z2dlc3Rpb24iLCJnZXRIeXBlcmNsaWNrU3VnZ2VzdGlvbiIsInJvb3REaXJzIiwicHJvamVjdCIsImdldERpcmVjdG9yaWVzIiwibGVuZ3RoIiwicGF0aCIsInByb2Nlc3NJZCIsInByb2Nlc3MiLCJwaWQiLCJyb290UGF0aCJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQTs7SUFBWUEsRTs7QUFDWjs7SUFBWUMsRTs7QUFDWjs7SUFBWUMsRzs7QUFFWjs7OztBQUNBOzs7O0FBRUE7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBRUE7Ozs7Ozs7O0lBRXFCQyxVLEdBQU4sTUFBTUEsVUFBTixDQUFpQjtBQUFBO0FBQUEsU0FDOUJDLFdBRDhCLEdBQ2hCLCtCQURnQjtBQUFBOztBQWM5QkMsWUFBVTtBQUFFLFVBQU0sK0NBQU47QUFBdUQ7QUFDbkVDLHFCQUFtQjtBQUFFLFVBQU0sd0RBQU47QUFBZ0U7O0FBRXJGQyxhQUFpQjtBQUNmLFNBQUtDLE1BQUwsR0FBY0MsS0FBS0MsTUFBTCxDQUFZQyxHQUFaLENBQWdCLGVBQWhC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LEtBQUtNLGNBQUwsRUFBakQsQ0FBOUIsR0FBd0d2QixRQUFRQyxPQUFSLENBQWdCLElBQWhCLENBQS9HO0FBQ0Q7O0FBRUR1QixzQkFBZ0Q7QUFDOUMsV0FBTztBQUNMNUIsZ0JBQVUsRUFETDtBQUVMNkIsb0JBQWMsS0FBSy9FLE9BQUwsRUFGVDtBQUdMZ0YscUJBQWUsS0FBS0MsdUJBQUwsQ0FBNkI3QixJQUE3QixDQUFrQyxJQUFsQztBQUhWLEtBQVA7QUFLRDs7QUFFRDZCLDBCQUF3QjVCLE1BQXhCLEVBQWlEa0IsS0FBakQsRUFBNEc7QUFDMUcsV0FBTyxLQUFLaEMsVUFBTCxJQUFtQixJQUFuQixHQUEwQixLQUFLQSxVQUFMLENBQWdCeUMsYUFBaEIsQ0FBOEIzQixNQUE5QixFQUFzQ2tCLEtBQXRDLENBQTFCLEdBQXlFakIsUUFBUUMsT0FBUixDQUFnQixJQUFoQixDQUFoRjtBQUNEOztBQUVEc0IsbUJBQTBCO0FBQ3hCLFVBQU1LLFdBQXVCOUUsS0FBSytFLE9BQUwsQ0FBYUMsY0FBYixFQUE3QjtBQUNBLFdBQU9GLFNBQVNHLE1BQVQsR0FBa0IsQ0FBbEIsR0FBc0JILFNBQVMsQ0FBVCxFQUFZSSxJQUFsQyxHQUF5QyxJQUFoRDtBQUNEOztBQUVEMUQsd0JBQTJDO0FBQ3pDLFdBQU87QUFDTDJELGlCQUFXQyxRQUFRQyxHQURkO0FBRUwzRCxvQkFBYyxFQUZUO0FBR0w0RCxnQkFBVSxLQUFLYixjQUFMO0FBSEwsS0FBUDtBQUtEO0FBakw2QixDO2tCQUFYL0UsVSIsImZpbGUiOiJhdXRvLWJyaWRnZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XHJcblxyXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgbHMgZnJvbSAnLi9wcm90b2NvbC9sYW5ndWFnZWNsaWVudC12Mic7XHJcbmltcG9ydCAqIGFzIHJwYyBmcm9tICd2c2NvZGUtanNvbnJwYyc7XHJcblxyXG5pbXBvcnQgQ29uc29sZUxvZ2dlciBmcm9tICcuL2xvZ2dlcnMvY29uc29sZS1sb2dnZXInO1xyXG5pbXBvcnQgTnVsbExvZ2dlciBmcm9tICcuL2xvZ2dlcnMvbnVsbC1sb2dnZXInO1xyXG5cclxuaW1wb3J0IEF1dG9jb21wbGV0ZUJyaWRnZSBmcm9tICcuL2JyaWRnZXMvYXV0b2NvbXBsZXRlLWJyaWRnZSc7XHJcbmltcG9ydCBEb2N1bWVudFN5bmNCcmlkZ2UgZnJvbSAnLi9icmlkZ2VzL2RvY3VtZW50LXN5bmMtYnJpZGdlJztcclxuaW1wb3J0IEZvcm1hdENvZGVCcmlkZ2UgZnJvbSAnLi9icmlkZ2VzL2Zvcm1hdC1jb2RlLWJyaWRnZSc7XHJcbmltcG9ydCBMaW50ZXJCcmlkZ2UgZnJvbSAnLi9icmlkZ2VzL2xpbnRlci1icmlkZ2UnO1xyXG5pbXBvcnQgTm90aWZpY2F0aW9uc0JyaWRnZSBmcm9tICcuL2JyaWRnZXMvbm90aWZpY2F0aW9ucy1icmlkZ2UnO1xyXG5pbXBvcnQgTnVjbGlkZURlZmluaXRpb25CcmlkZ2UgZnJvbSAnLi9icmlkZ2VzL251Y2xpZGUtZGVmaW5pdGlvbi1icmlkZ2UnO1xyXG5pbXBvcnQgTnVjbGlkZUZpbmRSZWZlcmVuY2VzQnJpZGdlIGZyb20gJy4vYnJpZGdlcy9udWNsaWRlLWZpbmQtcmVmZXJlbmNlcy1icmlkZ2UnO1xyXG5pbXBvcnQgTnVjbGlkZUh5cGVyY2xpY2tCcmlkZ2UgZnJvbSAnLi9icmlkZ2VzL251Y2xpZGUtaHlwZXJjbGljay1icmlkZ2UnO1xyXG5pbXBvcnQgTnVjbGlkZU91dGxpbmVWaWV3QnJpZGdlIGZyb20gJy4vYnJpZGdlcy9udWNsaWRlLW91dGxpbmUtdmlldy1icmlkZ2UnO1xyXG5cclxuaW1wb3J0IHtDb21wb3NpdGVEaXNwb3NhYmxlfSBmcm9tICdhdG9tJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEF1dG9CcmlkZ2Uge1xyXG4gIF9kaXNwb3NhYmxlID0gbmV3IENvbXBvc2l0ZURpc3Bvc2FibGUoKTtcclxuICBfcHJvY2VzczogP2NoaWxkX3Byb2Nlc3MkQ2hpbGRQcm9jZXNzO1xyXG4gIF9sYzogbHMuTGFuZ3VhZ2VDbGllbnRWMjtcclxuXHJcbiAgYXV0b0NvbXBsZXRlOiA/QXV0b2NvbXBsZXRlQnJpZGdlO1xyXG4gIGRlZmluaXRpb25zOiA/TnVjbGlkZURlZmluaXRpb25CcmlkZ2U7XHJcbiAgZmluZFJlZmVyZW5jZXM6ID9OdWNsaWRlRmluZFJlZmVyZW5jZXNCcmlkZ2U7XHJcbiAgaHlwZXJjbGljazogP051Y2xpZGVIeXBlcmNsaWNrQnJpZGdlO1xyXG4gIGxpbnRlcjogP0xpbnRlckJyaWRnZTtcclxuICBvdXRsaW5lVmlldzogP051Y2xpZGVPdXRsaW5lVmlld0JyaWRnZTtcclxuXHJcbiAgbG9nZ2VyOiBDb25zb2xlTG9nZ2VyIHwgTnVsbExvZ2dlcjtcclxuXHJcbiAgZ2V0TmFtZSgpIHsgdGhyb3cgXCJNdXN0IHNldCBuYW1lIGZpZWxkIHdoZW4gZXh0ZW5kaW5nIEF1dG9CcmlkZ2VcIiB9O1xyXG4gIGdldEdyYW1tYXJTY29wZXMoKSB7IHRocm93IFwiTXVzdCBzZXQgZ3JhbW1hclNjb3BlcyBmaWVsZCB3aGVuIGV4dGVuZGluZyBBdXRvQnJpZGdlXCIgfTtcclxuXHJcbiAgYWN0aXZhdGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLmxvZ2dlciA9IGF0b20uY29uZmlnLmdldCgnY29yZS5kZWJ1Z0xTUCcpID8gbmV3IENvbnNvbGVMb2dnZXIodGhpcy5nZXROYW1lKCkpIDogbmV3IE51bGxMb2dnZXIoKTtcclxuICAgIHRoaXMuc3RhcnRTZXJ2ZXIoKTtcclxuICB9XHJcblxyXG4gIGRlYWN0aXZhdGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcclxuXHJcbiAgICBpZiAodGhpcy5fbGMpIHtcclxuICAgICAgdGhpcy5fbGMuc2h1dGRvd24oKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5fcHJvY2VzcyAhPSBudWxsKSB7XHJcbiAgICAgIHRoaXMuX3Byb2Nlc3Mua2lsbCgpO1xyXG4gICAgICB0aGlzLl9wcm9jZXNzID0gbnVsbDtcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBhc3luYyBzdGFydFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICh0aGlzLl9wcm9jZXNzICE9IG51bGwpIHJldHVybjtcclxuXHJcbiAgICB0aGlzLl9wcm9jZXNzID0gYXdhaXQgdGhpcy5zdGFydFNlcnZlclByb2Nlc3MoKTtcclxuXHJcbiAgICBjb25zdCBjb25uZWN0aW9uID0gcnBjLmNyZWF0ZU1lc3NhZ2VDb25uZWN0aW9uKFxyXG4gICAgICBuZXcgcnBjLlN0cmVhbU1lc3NhZ2VSZWFkZXIodGhpcy5fcHJvY2Vzcy5zdGRvdXQpLFxyXG4gICAgICBuZXcgcnBjLlN0cmVhbU1lc3NhZ2VXcml0ZXIodGhpcy5fcHJvY2Vzcy5zdGRpbiksXHJcbiAgICAgIHsgZXJyb3I6IChtOiBPYmplY3QpID0+IHsgdGhpcy5sb2dnZXIuZXJyb3IobSk7IH0gfSk7XHJcblxyXG4gICAgdGhpcy5fbGMgPSBuZXcgbHMuTGFuZ3VhZ2VDbGllbnRWMihjb25uZWN0aW9uLCB0aGlzLmxvZ2dlcik7XHJcbiAgICB0aGlzLl9sYy5vbkxvZ01lc3NhZ2UobSA9PiB0aGlzLmxvZ2dlci5sb2coWydMb2cnLCBtXSkpO1xyXG5cclxuICAgIGNvbnN0IGluaXRpYWxpemVSZXNwb25zZSA9IGF3YWl0IHRoaXMuX2xjLmluaXRpYWxpemUodGhpcy5nZXRJbml0aWFsaXplUGFyYW1zKCkpO1xyXG4gICAgdGhpcy5icmlkZ2VDYXBhYmlsaXRpZXMoaW5pdGlhbGl6ZVJlc3BvbnNlLmNhcGFiaWxpdGllcyk7XHJcbiAgICB0aGlzLnBvc3RJbml0aWFsaXphdGlvbihpbml0aWFsaXplUmVzcG9uc2UpO1xyXG4gIH1cclxuXHJcbiAgc3RhcnRTZXJ2ZXJQcm9jZXNzKCk6IGNoaWxkX3Byb2Nlc3MkQ2hpbGRQcm9jZXNzIHtcclxuICAgIHRocm93IFwiTXVzdCBvdmVycmlkZSBzdGFydFNlcnZlclByb2Nlc3MgdG8gc3RhcnQgdGhlIGxhbmd1YWdlIHNlcnZlciBwcm9jZXNzIHdoZW4gZXh0ZW5kaW5nIEF1dG9CcmlkZ2VcIjtcclxuICB9XHJcblxyXG4gIGJyaWRnZUNhcGFiaWxpdGllcyhjYXBhYmlsaXRpZXM6IGxzLlNlcnZlckNhcGFiaWxpdGllcyk6IHZvaWQge1xyXG4gICAgdGhpcy5saW50ZXIgPSBuZXcgTGludGVyQnJpZGdlKHRoaXMuX2xjKTtcclxuICAgIGlmIChjYXBhYmlsaXRpZXMuY29tcGxldGlvblByb3ZpZGVyKSB7XHJcbiAgICAgIHRoaXMuYXV0b0NvbXBsZXRlID0gbmV3IEF1dG9jb21wbGV0ZUJyaWRnZSh0aGlzLl9sYyk7XHJcbiAgICB9XHJcbiAgICBpZiAoY2FwYWJpbGl0aWVzLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIpIHtcclxuICAgICAgdGhpcy5vdXRsaW5lVmlldyA9IG5ldyBOdWNsaWRlT3V0bGluZVZpZXdCcmlkZ2UodGhpcy5fbGMsIHRoaXMuZ2V0TmFtZSgpKTtcclxuICAgIH1cclxuICAgIGlmIChjYXBhYmlsaXRpZXMuZGVmaW5pdGlvblByb3ZpZGVyKSB7XHJcbiAgICAgIHRoaXMuZGVmaW5pdGlvbnMgPSBuZXcgTnVjbGlkZURlZmluaXRpb25CcmlkZ2UodGhpcy5fbGMpO1xyXG4gICAgICB0aGlzLmh5cGVyY2xpY2sgPSBuZXcgTnVjbGlkZUh5cGVyY2xpY2tCcmlkZ2UodGhpcy5fbGMpO1xyXG4gICAgfVxyXG4gICAgaWYgKGNhcGFiaWxpdGllcy5yZWZlcmVuY2VzUHJvdmlkZXIpIHtcclxuICAgICAgdGhpcy5maW5kUmVmZXJlbmNlcyA9IG5ldyBOdWNsaWRlRmluZFJlZmVyZW5jZXNCcmlkZ2UodGhpcy5fbGMpO1xyXG4gICAgfVxyXG5cclxuICAgIG5ldyBOb3RpZmljYXRpb25zQnJpZGdlKHRoaXMuX2xjLCB0aGlzLmdldE5hbWUoKSk7XHJcblxyXG4gICAgaWYgKGNhcGFiaWxpdGllcy50ZXh0RG9jdW1lbnRTeW5jKSB7XHJcbiAgICAgIHRoaXMuX2Rpc3Bvc2FibGUuYWRkKG5ldyBEb2N1bWVudFN5bmNCcmlkZ2UodGhpcy5fbGMsIGNhcGFiaWxpdGllcy50ZXh0RG9jdW1lbnRTeW5jKSk7XHJcbiAgICB9XHJcbiAgICBpZiAoY2FwYWJpbGl0aWVzLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nUHJvdmlkZXIgfHwgY2FwYWJpbGl0aWVzLmRvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyKSB7XHJcbiAgICAgIHRoaXMuX2Rpc3Bvc2FibGUuYWRkKG5ldyBGb3JtYXRDb2RlQnJpZGdlKHRoaXMuX2xjLCBjYXBhYmlsaXRpZXMuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdQcm92aWRlciA9PT0gdHJ1ZSwgY2FwYWJpbGl0aWVzLmRvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyID09PSB0cnVlKSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwb3N0SW5pdGlhbGl6YXRpb24oSW5pdGlhbGl6YXRpb25SZXN1bHQ6IGxzLkluaXRpYWxpemVSZXN1bHQpOiB2b2lkIHtcclxuICB9XHJcblxyXG4gIHByb3ZpZGVPdXRsaW5lcygpOiBudWNsaWRlJE91dGxpbmVQcm92aWRlciB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBuYW1lOiB0aGlzLmdldE5hbWUoKSxcclxuICAgICAgZ3JhbW1hclNjb3BlczogdGhpcy5nZXRHcmFtbWFyU2NvcGVzKCksXHJcbiAgICAgIHByaW9yaXR5OiAxLFxyXG4gICAgICBnZXRPdXRsaW5lOiB0aGlzLmdldE91dGxpbmUuYmluZCh0aGlzKVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGdldE91dGxpbmUoZWRpdG9yOiBhdG9tJFRleHRFZGl0b3IpOiBQcm9taXNlPD9udWNsaWRlJE91dGxpbmU+IHtcclxuICAgIHJldHVybiB0aGlzLm91dGxpbmVWaWV3ICE9IG51bGwgPyB0aGlzLm91dGxpbmVWaWV3LmdldE91dGxpbmUoZWRpdG9yKSA6IFByb21pc2UucmVzb2x2ZShudWxsKTtcclxuICB9XHJcblxyXG4gIHByb3ZpZGVMaW50ZXIoKTogbGludGVyJFN0YW5kYXJkTGludGVyIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG5hbWU6IHRoaXMuZ2V0TmFtZSgpLFxyXG4gICAgICBncmFtbWFyU2NvcGVzOiB0aGlzLmdldEdyYW1tYXJTY29wZXMoKSxcclxuICAgICAgc2NvcGU6ICdwcm9qZWN0JyxcclxuICAgICAgbGludE9uRmx5OiB0cnVlLFxyXG4gICAgICBsaW50OiB0aGlzLnByb3ZpZGVMaW50aW5nLmJpbmQodGhpcylcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBwcm92aWRlTGludGluZyhlZGl0b3I6IGF0b20kVGV4dEVkaXRvcik6ID9BcnJheTxsaW50ZXIkTWVzc2FnZT4gfCBQcm9taXNlPD9BcnJheTxsaW50ZXIkTWVzc2FnZT4+IHtcclxuICAgIHJldHVybiB0aGlzLmxpbnRlciAhPSBudWxsID8gdGhpcy5saW50ZXIucHJvdmlkZURpYWdub3N0aWNzKCkgOiBQcm9taXNlLnJlc29sdmUoW10pO1xyXG4gIH1cclxuXHJcbiAgcHJvdmlkZUF1dG9jb21wbGV0ZSgpOiBhdG9tJEF1dG9jb21wbGV0ZVByb3ZpZGVyIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNlbGVjdG9yOiAnLnNvdXJjZScsXHJcbiAgICAgIGV4Y2x1ZGVMb3dlclByaW9yaXR5OiBmYWxzZSxcclxuICAgICAgZ2V0U3VnZ2VzdGlvbnM6IHRoaXMucHJvdmlkZVN1Z2dlc3Rpb25zLmJpbmQodGhpcylcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBwcm92aWRlU3VnZ2VzdGlvbnMocmVxdWVzdDogYW55KTogUHJvbWlzZTxBcnJheTxhdG9tJEF1dG9jb21wbGV0ZVN1Z2dlc3Rpb24+PiB7XHJcbiAgICByZXR1cm4gdGhpcy5hdXRvQ29tcGxldGUgIT0gbnVsbCA/IHRoaXMuYXV0b0NvbXBsZXRlLnByb3ZpZGVTdWdnZXN0aW9ucyhyZXF1ZXN0KSA6IFByb21pc2UucmVzb2x2ZShbXSk7XHJcbiAgfVxyXG5cclxuICBwcm92aWRlRGVmaW5pdGlvbnMoKTogbnVjbGlkZSREZWZpbml0aW9uUHJvdmlkZXIge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbmFtZTogdGhpcy5nZXROYW1lKCksXHJcbiAgICAgIHByaW9yaXR5OiAyMCxcclxuICAgICAgZ3JhbW1hclNjb3BlczogdGhpcy5nZXRHcmFtbWFyU2NvcGVzKCksXHJcbiAgICAgIGdldERlZmluaXRpb246IHRoaXMuZ2V0RGVmaW5pdGlvbi5iaW5kKHRoaXMpLFxyXG4gICAgICBnZXREZWZpbml0aW9uQnlJZDogdGhpcy5nZXREZWZpbml0aW9uQnlJZC5iaW5kKHRoaXMpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBnZXREZWZpbml0aW9uKGVkaXRvcjogVGV4dEVkaXRvciwgcG9pbnQ6IGF0b20kUG9pbnQpOiBQcm9taXNlPD9udWNsaWRlJERlZmluaXRpb25RdWVyeVJlc3VsdD4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZGVmaW5pdGlvbnMgIT0gbnVsbCA/IHRoaXMuZGVmaW5pdGlvbnMuZ2V0RGVmaW5pdGlvbihlZGl0b3IsIHBvaW50KSA6IFByb21pc2UucmVzb2x2ZShudWxsKTtcclxuICB9XHJcblxyXG4gIGdldERlZmluaXRpb25CeUlkKGZpbGVuYW1lOiBOdWNsaWRlVXJpLCBpZDogc3RyaW5nKTogUHJvbWlzZTw/bnVjbGlkZSREZWZpbml0aW9uPiB7XHJcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpOyAvLyBUT0RPOiBJcyB0aGlzIG5lZWRlZD9cclxuICB9XHJcblxyXG4gIHByb3ZpZGVGaW5kUmVmZXJlbmNlcygpOiBudWNsaWRlJEZpbmRSZWZlcmVuY2VzUHJvdmlkZXIge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaXNFZGl0b3JTdXBwb3J0ZWQ6IChlZGl0b3I6IGF0b20kVGV4dEVkaXRvcikgPT4gdHJ1ZSwgLy8gVE9ETzogR3JhbW1hci1zZWxlY3QvZXh0ZW5zaW9uIGJhc2VkP1xyXG4gICAgICBmaW5kUmVmZXJlbmNlczogdGhpcy5nZXRSZWZlcmVuY2VzLmJpbmQodGhpcylcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldFJlZmVyZW5jZXMoZWRpdG9yOiBhdG9tJFRleHRFZGl0b3IsIHBvaW50OiBhdG9tJFBvaW50KTogUHJvbWlzZTw/bnVjbGlkZSRGaW5kUmVmZXJlbmNlc1JldHVybj4ge1xyXG4gICAgcmV0dXJuIHRoaXMuZmluZFJlZmVyZW5jZXMgIT0gbnVsbCA/IHRoaXMuZmluZFJlZmVyZW5jZXMuZ2V0UmVmZXJlbmNlcyhlZGl0b3IsIHBvaW50LCB0aGlzLmdldFByb2plY3RSb290KCkpIDogUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xyXG4gIH1cclxuXHJcbiAgcHJvdmlkZUh5cGVyY2xpY2soKTogbnVjbGlkZSRIeXBlcmNsaWNrUHJvdmlkZXIge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcHJpb3JpdHk6IDIwLFxyXG4gICAgICBwcm92aWRlck5hbWU6IHRoaXMuZ2V0TmFtZSgpLFxyXG4gICAgICBnZXRTdWdnZXN0aW9uOiB0aGlzLmdldEh5cGVyY2xpY2tTdWdnZXN0aW9uLmJpbmQodGhpcylcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBnZXRIeXBlcmNsaWNrU3VnZ2VzdGlvbihlZGl0b3I6IGF0b20kVGV4dEVkaXRvciwgcG9pbnQ6IGF0b20kUG9pbnQpOiBQcm9taXNlPD9udWNsaWRlJEh5cGVyY2xpY2tTdWdnZXN0aW9uPiB7XHJcbiAgICByZXR1cm4gdGhpcy5oeXBlcmNsaWNrICE9IG51bGwgPyB0aGlzLmh5cGVyY2xpY2suZ2V0U3VnZ2VzdGlvbihlZGl0b3IsIHBvaW50KSA6IFByb21pc2UucmVzb2x2ZShudWxsKTtcclxuICB9XHJcblxyXG4gIGdldFByb2plY3RSb290KCk6ID9zdHJpbmcge1xyXG4gICAgY29uc3Qgcm9vdERpcnM6IEFycmF5PGFueT4gPSBhdG9tLnByb2plY3QuZ2V0RGlyZWN0b3JpZXMoKTtcclxuICAgIHJldHVybiByb290RGlycy5sZW5ndGggPiAwID8gcm9vdERpcnNbMF0ucGF0aCA6IG51bGxcclxuICB9XHJcblxyXG4gIGdldEluaXRpYWxpemVQYXJhbXMoKTogbHMuSW5pdGlhbGl6ZVBhcmFtcyB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwcm9jZXNzSWQ6IHByb2Nlc3MucGlkLFxyXG4gICAgICBjYXBhYmlsaXRpZXM6IHsgfSxcclxuICAgICAgcm9vdFBhdGg6IHRoaXMuZ2V0UHJvamVjdFJvb3QoKVxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuIl19