import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import ReactPlayer from 'react-player/lazy'

import { VideoView, VIDEO_VIEW } from './view_container/videoview';
// import { TimestampPluginSettings } from 'setting';


const ERRORS: { [key: string]: string } = {
	"INVALID_URL": "\n> [!error] Invalid Video URL\n> The highlighted link is not a valid video url. Please try again with a valid link.\n",
	"NO_ACTIVE_VIDEO": "\n> [!caution] Select Video\n> A video needs to be opened before using this hotkey.\n Highlight your video link and input your 'Open video player' hotkey to register a video.\n",
}

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	noteTitle: string;
	urlStartTimeMap: Map<string, number>;
	urlColor: string;
	timestampColor: string;
	urlTextColor: string;
	timestampTextColor: string;
	forwardSeek: string;
	backwardsSeek: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	noteTitle: "",
	urlStartTimeMap: new Map<string, number>(),
	urlColor: 'blue',
	timestampColor: 'green',
	urlTextColor: 'white',
	timestampTextColor: 'white',
	forwardSeek: '10',
	backwardsSeek: '10'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	player: ReactPlayer;
	setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
	editor: Editor;

	async onload() {

		// Register view
		this.registerView(
			VIDEO_VIEW,
			(leaf) => new VideoView(leaf)
		);

			// Register settings
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('video', 'Play Media', (evt: MouseEvent ) => {
			// Called when the user clicks the icon.
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			
			if (activeView) {
				new Notice('Opening video!');

				if (!this.editor) {
					this.editor = activeView.editor;
					}
				const url = this.editor.getSelection().trim();
				this.activateView(url, this.editor);
			}else{
				new Notice(ERRORS["NO_ACTIVE_VIDEO"]);
			}
			
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Media-Notes Running!');


		this.registerMarkdownCodeBlockProcessor("timestamp", (source, el, ctx) => {
			const regExpWithHint = /(\d+:\d+:\d+|\d+:\d+)\s*:\s*(.+)/;
			const regExpWithoutHint = /\d+:\d+:\d+|\d+:\d+/g;
			const rows = source.split("\n").filter((row) => row.length > 0);
			rows.forEach((row) => {
			const matchWithHint = regExpWithHint.exec(row);
			const matchWithoutHint = row.match(regExpWithoutHint);
			
			if (matchWithHint || matchWithoutHint) {
				// create a button for each timestamp
				const div = el.createEl("div");
				const button = div.createEl("button");

				let timestamp: any;
				if (matchWithHint) {
					timestamp = matchWithHint[1];
					button.innerText = timestamp;
				
					// create a text element for the hint
					const hintElement = div.createEl("span");
					hintElement.className = 'timestamp-hint'; // Add this class for styling
					hintElement.innerText = matchWithHint[2]; // Matched hint
					div.appendChild(button); // Append the button first
					div.appendChild(hintElement); // Append the hint text next to the button
				} else {
					timestamp = matchWithoutHint[0];
					button.innerText = timestamp;
					div.appendChild(button);
				}
				
				button.className = 'timestamp-button'; // Add this class for styling
				
				// convert timestamp to seconds and seek to that position when clicked
				button.addEventListener("click", () => {
					const timeArr = timestamp.split(":").map((v:any) => parseInt(v)); 
					const [hh, mm, ss] = timeArr.length === 2 ? [0, ...timeArr] : timeArr;
					const seconds = (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
					if (this.player) this.player.seekTo(seconds);
				});
			}
		});


		});


		this.registerMarkdownCodeBlockProcessor("timestamp-url", (source, el, ctx) => {
			const url = source.trim();
			if (ReactPlayer.canPlay(url)) {
				// Creates button for video url
				const div = el.createEl("div");
				const button = div.createEl("button");
				button.innerText = url;
				button.className = 'url-button';

				button.addEventListener("click", () => {
					this.activateView(url, this.editor);
				});
			} else {
				if (this.editor) {
					this.editor.replaceSelection(this.editor.getSelection() + "\n" + ERRORS["INVALID_URL"]);
				}
			}
		});

		this.addCommand({
			id: 'open-media-player',
			name: 'Media Player (simple)',
			editorCallback: (editor: Editor, view: MarkdownView) =>{
				const url = editor.getSelection().trim();
				this.activateView(url, editor);
			}
		});
		this.addCommand({
			id: 'test-media-player',
			name: 'TEST Media Player VIDEO',
			editorCallback: (editor: Editor, view: MarkdownView) =>{
				this.activateView(`https://www.youtube.com/watch?v=487AjvFW1lk`, editor);
			}
		});
	}

	async activateView(url: string, editor: Editor) {
		this.app.workspace.detachLeavesOfType(VIDEO_VIEW);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: VIDEO_VIEW,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIDEO_VIEW)[0]
		);
				// This triggers the React component to be loaded
				this.app.workspace.getLeavesOfType(VIDEO_VIEW).forEach(async (leaf) => {
					if (leaf.view instanceof VideoView) {
		
						const setupPlayer = (player: ReactPlayer, setPlaying: React.Dispatch<React.SetStateAction<boolean>>) => {
							this.player = player;
							this.setPlaying = setPlaying;
						}
		
						const setupError = (err: string) => {
							editor.replaceSelection(editor.getSelection() + `\n> [!error] Streaming Error \n> ${err}\n`);
						}
		
						const saveTimeOnUnload = async () => {
							if (this.player) {
								this.settings.urlStartTimeMap.set(url, Number(this.player.getCurrentTime().toFixed(0)));
							}
							await this.saveSettings();
						}
		
						// create a new video instance, sets up state/unload functionality, and passes in a start time if available else 0
						leaf.setEphemeralState({
							url,
							setupPlayer,
							setupError,
							saveTimeOnUnload,
							start: ~~this.settings.urlStartTimeMap.get(url)
						});


						await this.saveSettings();
					}		
				});
	}			

	async loadSettings() {
		// Fix for a weird bug that turns default map into a normal object when loaded
		const data = await this.loadData()
		if (data) {
			const map = new Map(Object.keys(data.urlStartTimeMap).map(k => [k, data.urlStartTimeMap[k]]))
			this.settings = { ...DEFAULT_SETTINGS, ...data, urlStartTimeMap: map };
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		}
	}

	onunload() {
		this.player = null;
		this.editor = null;
		this.setPlaying = null;
		this.app.workspace.detachLeavesOfType(VIDEO_VIEW);
	}

	async saveSettings() {
		// await this.saveData(this.settings);
	}
}
	

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}

// 	onOpen() {
// 		const {contentEl} = this;
// 		contentEl.setText('Woah!');
// 	}

// 	onClose() {
// 		const {contentEl} = this;
// 		contentEl.empty();
// 	}
// }

// class SampleSettingTab extends PluginSettingTab {
// 	plugin: MyPlugin;

// 	constructor(app: App, plugin: MyPlugin) {
// 		super(app, plugin);
// 		this.plugin = plugin;
// 	}

// 	display(): void {
// 		const {containerEl} = this;

// 		containerEl.empty();

// 		new Setting(containerEl)
// 			.setName('Setting #1')
// 			.setDesc('It\'s a secret')
// 			.addText(text => text
// 				.setPlaceholder('Enter your secret')
// 				.setValue(this.plugin.settings.mySetting)
// 				.onChange(async (value) => {
// 					this.plugin.settings.mySetting = value;
// 					await this.plugin.saveSettings();
// 				}));
// 	}
// }
