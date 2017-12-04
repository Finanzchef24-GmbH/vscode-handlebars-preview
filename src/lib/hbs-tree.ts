import * as vscode from 'vscode';
import * as json from 'jsonc-parser';
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import * as _ from 'lodash';
import parseAll from './parse-hbs';
import * as traverse from 'traverse';
import { TextDocument, workspace, TreeItemCollapsibleState } from 'vscode';

export default class HbsOutlineProvider implements vscode.TreeDataProvider<json.Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<json.Node | null> = new vscode.EventEmitter<json.Node | null>();
	readonly onDidChangeTreeData: vscode.Event<json.Node | null> = this._onDidChangeTreeData.event;

	private tree: json.Node;
	private schema: any;
	private editor: vscode.TextEditor;

	private dataFileGlob: string;
	private dataPath: string;
	private dataDocument: TextDocument;

	constructor(private context: vscode.ExtensionContext) {
		vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.fileName === this.dataPath) {
				this.refresh();
			}
		})

		vscode.workspace.onDidOpenTextDocument(e => {
			if (e.fileName === this.dataPath) {
				this.dataDocument = e;
				this.refresh();
			}
		})

		this.dataFileGlob = vscode.workspace.getConfiguration('handlebarsPreview').dataGlob;
		let matches = glob.sync(this.dataFileGlob, {cwd: vscode.workspace.rootPath}) 
		this.dataPath = path.join(vscode.workspace.rootPath, matches[0])

		if (vscode.window.activeTextEditor.document.fileName === this.dataPath) {
			this.dataDocument = vscode.window.activeTextEditor.document;
			this.refresh();
		} else {
			vscode.workspace.openTextDocument(this.dataPath);
		}
	}

	private refresh(): void {
		parseAll(workspace.rootPath)
			.then(schema => {
				this.schema = schema;

				this.parseTree();
				this.filterSchema();
				this._onDidChangeTreeData.fire();
			})
		
	}

	private _extractSchemaPathFromNode(node: json.Node) {
		let result;

		if (!_.get(node, 'children[0].value', false)) {
			result = '';
		} else {
			result = node.children[0].value.toString();
		}

		if (_.get(node, 'children[1].type', '') === 'array') {
			result = result + '.#';
		}
		
		if (node.parent) {
			result = this._extractSchemaPathFromNode(node.parent) + (result !== '' ? '.' + result : '');
		}

		return result;
	}

	private filterSchema(): void {
		let schemaPaths = _(traverse.paths(this.schema)).filter(function(path) {
			return !_.contains(path, '_optional') && !_.contains(path, '_type')
		}).map(function(path){
			return path.join('.');
		}).value();

		let self = this;

		traverse.forEach(this.tree, function() {
			let node = this.node;

			if(!_.get(node, 'type', false)) {
				return;
			}

			let path = self._extractSchemaPathFromNode(node).replace(/^\./, '');
			
			if (path !== '' && !_.contains(schemaPaths, path)) {
				this.remove();
			}
		});
	}

	private parseTree(): void {
		let tree = null;

		let data = this.dataDocument.getText()
		tree = json.parseTree(data);
	
		this.tree = tree;
	}

	getChildren(node?: json.Node): Thenable<json.Node[]> {
		if (node) {
			return Promise.resolve(this._getChildren(node));
		} else {
			return Promise.resolve(this.tree ? this.tree.children : []);
		}
	}

	private _getChildren(node: json.Node): json.Node[] {
		return node.parent.type === 'array' ? this.toArrayValueNode(node) : (node.type === 'array' ? node.children[0].children : node.children[1].children);
	}

	private toArrayValueNode(node: json.Node): json.Node[] {
		if (node.type === 'array' || node.type === 'object') {
			return node.children;
		}
		node['arrayValue'] = true;
		return [node];
	}

	getTreeItem(node: json.Node): vscode.TreeItem {
		let valueNode = node.parent.type === 'array' ? node : node.children[1];
		let hasChildren = (node.parent.type === 'array' && !node['arrayValue']) || valueNode.type === 'object' || valueNode.type === 'array';
		let treeItem: vscode.TreeItem = new vscode.TreeItem(this.getLabel(node), hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

		let stringOffset = valueNode.type === 'string' ? 1 : 0 

		if (!hasChildren){
			treeItem.command = {
				command: 'extension.changeValue',
				title: '',
				arguments: [new vscode.Range(this.dataDocument.positionAt(valueNode.offset + stringOffset), this.dataDocument.positionAt(valueNode.offset + valueNode.length - stringOffset))]
			};
		}
		treeItem.iconPath = this.getIcon(node);
		treeItem.contextValue = this.getNodeType(node);
		if (!node.parent.parent) {
			treeItem.collapsibleState = TreeItemCollapsibleState.Expanded;
		}
		
		return treeItem;
	}

	select(range: vscode.Range) {
		vscode.window.showTextDocument(this.dataDocument).then(editor => {
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range)
		});
	}

	edit(range: vscode.Range) {
		let dataUri = this.dataDocument.uri;
		let oldValue = this.dataDocument.getText(range)

		vscode.window.showInputBox({
			prompt: 'Enter new value',
			value: oldValue
		}).then(value => {
			if (!_.isUndefined(value)) {
				let textEdit = new vscode.TextEdit(range, value);
				let workSpaceEdit = new vscode.WorkspaceEdit();
	
				workSpaceEdit.set(this.dataDocument.uri, [textEdit]);
				vscode.workspace.applyEdit(workSpaceEdit);
			}
		})
	}

	private getIcon(node: json.Node): any {
		let nodeType = this.getNodeType(node);
		if (nodeType === 'boolean') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'boolean.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'boolean.svg'))
			}
		}
		if (nodeType === 'string') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'string.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'string.svg'))
			}
		}
		if (nodeType === 'number') {
			return {
				light: this.context.asAbsolutePath(path.join('resources', 'light', 'number.svg')),
				dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'number.svg'))
			}
		}
		return null;
	}

	private getNodeType(node: json.Node): json.NodeType {
		if (node.parent.type === 'array') {
			return node.type;
		}
		return node.children[1].type;
	}

	private getLabel(node: json.Node): string {
		if (node.parent.type === 'array') {
			if (node['arrayValue']) {
				delete node['arrayValue'];
				if (!node.children) {
					return node.value.toString();
				}
			} else {
				return node.parent.children.indexOf(node).toString();
			}
		}
		const property = node.children[0].value.toString();
		if (node.children[1].type === 'object') {
			return '{ } ' + property;
		}
		if (node.children[1].type === 'array') {
			return '[ ] ' + property;
		}
		const value = this.dataDocument.getText(new vscode.Range(this.dataDocument.positionAt(node.children[1].offset), this.dataDocument.positionAt(node.children[1].offset + node.children[1].length)))
		
		return `${property}: ${value}`;
	}
}

