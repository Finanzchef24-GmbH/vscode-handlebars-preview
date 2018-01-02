import * as vscode from 'vscode';
import * as json from 'jsonc-parser';
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import * as _ from 'lodash';
import parseAll from './parse-hbs';
import * as traverse from 'traverse';
import { TextDocument, workspace, TreeItemCollapsibleState } from 'vscode';

export default class HbsOutlineProvider implements vscode.TreeDataProvider<string> {

	private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
	readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

	private tree: json.Node;
	private schema: any;
	private editor: vscode.TextEditor;
	private text: string;

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

		if (_.get(vscode, 'window.activeTextEditor.document.fileName', null) === this.dataPath) {
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
	
		this.text = data;
		this.tree = tree;
	}

	getChildren(offset?: string): Thenable<string[]> {
		if (offset) {
			const path = json.getLocation(this.text, parseInt(offset)).path
			const node = json.findNodeAtLocation(this.tree, path);
			return Promise.resolve(this.getChildrenOffsets(node));
		} else {
			return Promise.resolve(this.tree ? this.getChildrenOffsets(this.tree) : []);
		}
	}

	private getChildrenOffsets(node: json.Node): string[] {
		const offsets = [];
		for (const child of node.children || []) {
			const childPath = json.getLocation(this.text, child.offset).path
			const childNode = json.findNodeAtLocation(this.tree, childPath);
			if (childNode) {
				offsets.push(childNode.offset.toString());
			}
		}
		return offsets;
	}

	getTreeItem(offset: string): vscode.TreeItem {
		const path = json.getLocation(this.text, parseInt(offset)).path
		const valueNode = json.findNodeAtLocation(this.tree, path);
		if (valueNode) {
			let hasChildren = valueNode.type === 'object' || valueNode.type === 'array';
			let treeItem: vscode.TreeItem = new vscode.TreeItem(this.getLabel(valueNode), hasChildren ? valueNode.type === 'object' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
			
			let stringOffset = valueNode.type === 'string' ? 1 : 0;

			if (!hasChildren){
				treeItem.command = {
					command: 'extension.changeValue',
					title: '',
					arguments: [new vscode.Range(this.dataDocument.positionAt(valueNode.offset + stringOffset), this.dataDocument.positionAt(valueNode.offset + valueNode.length - stringOffset))]
				};
			}
			treeItem.iconPath = this.getIcon(valueNode);
			treeItem.contextValue = valueNode.type;

			if (!valueNode.parent.parent.parent) {
				treeItem.collapsibleState = TreeItemCollapsibleState.Expanded;
			} else {
				treeItem.collapsibleState = TreeItemCollapsibleState.Collapsed;
			}

			return treeItem;
		}
		return null;
	}

	select(range: vscode.Range) {
		vscode.window.showTextDocument(this.dataDocument).then(editor => {
			editor.selection = new vscode.Selection(range.start, range.end);
			editor.revealRange(range)
		});
	}

	edit(range: vscode.Range) {
		const dataUri = this.dataDocument.uri;
		const oldValue = this.dataDocument.getText(range)

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
		let nodeType = node.type;
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

	private getLabel(node: json.Node): string {
		if (node.parent.type === 'array') {
			let prefix = node.parent.children.indexOf(node).toString();
			if (node.type === 'object') {
				return prefix + ':{ }';
			}
			if (node.type === 'array') {
				return prefix + ':[ ]';
			}
			return prefix + ':' + node.value.toString();
		}
		else {
			const property = node.parent.children[0].value.toString();
			if (node.type === 'array' || node.type === 'object') {
				if (node.type === 'object') {
					return '{ } ' + property;
				}
				if (node.type === 'array') {
					return '[ ] ' + property;
				}
			}
			const value = this.dataDocument.getText(new vscode.Range(this.dataDocument.positionAt(node.offset), this.dataDocument.positionAt(node.offset + node.length)))
			return `${property}: ${value}`;
		}
	}

}