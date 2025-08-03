// Imports (keep only what you use—no deadweight)
import { consume } from "@lit/context";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import "mdui/components/button.js";
import "mdui/components/icon.js";
import "mdui/components/menu-item.js";
import "mdui/components/select.js";
import type { Select } from "mdui/components/select.js";
import "mdui/components/tabs.js";
import "mdui/components/tab-panel.js";
import "mdui/components/tab.js";
import "mdui/components/text-field.js";
import "../newt-grid.js";

import { NewtElement } from "../../NewtElement.js";
import { AttachmentFile } from "../../../shared/models/estimate-request.js";
import { attachmentsInfoPickerStyles } from "./attachments-style.js";
import { alertService } from "../../../services/index.js";
import { formatErrorsMessage } from "../../../utils/commonUtils.js";
import {
	ALLOWED_EXTENSIONS,
	formatFileSize,
} from "../../estimate-requests/utils/file-utils.js";

import {
	EstimateRequestAppService,
	estimateRequestAppServiceContext,
} from "../../../services/estimateRequestAppService.js";
import {
	UserService,
	userServiceContext,
} from "../../../services/userService.js";

// Utility
export class SelectOption {
	key!: string;
	title!: string;
	description?: string;
}

/**
 * AttachmentsInfoPicker
 * - Upload files/links for any subject/category
 * - Bulletproof UI & API contract
 */
@customElement("attachments-info-picker")
export class AttachmentsInfoPicker extends NewtElement {
	static override readonly styles = NewtElement.combineStyles(attachmentsInfoPickerStyles);

	// --- Service Injection ---
	@consume({ context: estimateRequestAppServiceContext, subscribe: true })
	private readonly estimateService!: EstimateRequestAppService;
	@consume({ context: userServiceContext, subscribe: true })
	private readonly userService!: UserService;

	// --- PUBLIC API (can be bound to HTML or parent components) ---
	@property({ type: Array }) attachments: AttachmentFile[] = [];
	@property({ type: String }) columnLayout: "one-column" | "two-column" = "two-column";
	@property({ type: Boolean }) showActions = true;

	@property({ type: Array }) subjectOptions: SelectOption[] = [];
	@property({ type: Array }) categoryOptions: SelectOption[] = [];

	@property({ type: String }) selectedSubjectKey = "";
	@property({ type: String }) selectedSubjectId = "";
	@property({ type: String }) selectedTitle = "";
	@property({ type: String }) selectedCategoryKey = "";

	@property({ type: Boolean }) shouldShowSubjectSelect = false;
	@property({ type: Boolean }) shouldShowSubjectIdInput = false;
	@property({ type: Boolean }) shouldShowTitleInput = false;
	@property({ type: Boolean }) shouldShowCategorySelect = false;
	@property({ type: Boolean }) shouldShowSelectedAttachmentsTable = false;
	@property({ type: Boolean }) shouldShowSubmitAttachmentsButton = false;

	// --- PRIVATE STATE (internal logic only) ---
	@state() private isUploading = false;
	@state() private isLinkMode = false;
	@state() private currentAttachment: AttachmentFile = new AttachmentFile();

	@query("#file-input") private readonly fileInput!: HTMLInputElement;
	@query("mdui-select") private readonly selectEl!: Select;

	// --- LIFECYCLE ---
	override connectedCallback(): void {
		super.connectedCallback();
		this._init();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
	}

	private _init() {
		try {
			this._setDefaults();
		} catch (err) {
			console.error("AttachmentsInfoPicker init failed:", err);
			alertService?.showErrorAlert("Failed to initialize file uploads");
		}
		this.updateComplete.then(() => {
			const tabsElement = this.shadowRoot?.querySelector("mdui-tabs") as any;
			if (tabsElement && !tabsElement.value) tabsElement.value = "file";
		});
	}

	private _setDefaults() {
		// Pristine starting state, safe for sharing and reuse
		this.selectedSubjectKey = "ESTIMATE_REQUEST";
		this.selectedSubjectId = "1";
		this.selectedCategoryKey = "TECHNICAL_DRAWINGS";
		this.selectedTitle = "New Project Estimate Request";
		this.shouldShowSubjectSelect = true;
		this.shouldShowSubjectIdInput = true;
		this.shouldShowTitleInput = true;
		this.shouldShowCategorySelect = true;
		this.shouldShowSelectedAttachmentsTable = true;
		this.shouldShowSubmitAttachmentsButton = true;
		if (!this.subjectOptions.length) {
			this.subjectOptions = [
				{ key: "ESTIMATE_REQUEST", title: "Estimate Request", description: "New Project Estimate Request" },
				{ key: "USER", title: "User", description: "User-Scoped Attachment" },
				{ key: "APP_LINKS", title: "Application Links" }
			];
		}
		if (!this.categoryOptions.length) {
			this.categoryOptions = [
				{ key: "TECHNICAL_DRAWINGS", title: "Technical Drawings" },
				{ key: "SPECIFICATIONS", title: "Specifications" },
				{ key: "PHOTOS", title: "Photos" },
				{ key: "REPORTS", title: "Reports" },
				{ key: "CONTRACTS", title: "Contracts" },
				{ key: "OTHER", title: "Other" }
			];
		}
		this._resetCurrentAttachment();
	}

	// --- STATE MANAGEMENT ---
	private _resetCurrentAttachment(refreshUI = false) {
		this.currentAttachment = new AttachmentFile();
		this.currentAttachment.isLink = this.isLinkMode;
		if (refreshUI) this.requestUpdate();
	}

	// --- EVENT HANDLERS ---
	private _handleTabChange(e: CustomEvent) {
		if (!(e.target instanceof Element) || e.target.tagName !== "MDUI-TABS") return;
		const tabsElement = e.target as any;
		const activeTab = tabsElement.querySelector("mdui-tab[active]");
		const tabValue = activeTab?.value;
		if (!tabValue) return;
		const newIsLinkMode = tabValue === "link";
		if (this.isLinkMode !== newIsLinkMode) {
			this.isLinkMode = newIsLinkMode;
			this._resetCurrentAttachment();
		}
	}
	private _handleSubjectChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		const newValue = target.value;
		if (newValue) this.selectedSubjectKey = newValue;
		const selectedOption = this.subjectOptions.find(opt => opt.key === newValue);
		if (selectedOption) this.selectedTitle = selectedOption.description || selectedOption.title;
	}
	private _handleCategoryChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		const newValue = target.value;
		if (newValue) this.currentAttachment.category = newValue;
		this.shouldShowCategorySelect = !!this.currentAttachment.category;
	}
	private _handleFileTitleChange = (e: InputEvent) => {
		const value = (e.target as HTMLInputElement).value;
		this.currentAttachment.name = value;
	};
	private _handleFileUploadClick() {
		this.fileInput?.click();
	}
	private _handleFileUpload = (e: Event) => {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			const selectedFile = input.files[0];
			this.currentAttachment.file = selectedFile;
			this.currentAttachment.size = selectedFile.size;
		}
	};
	private _handleKeyUploadClick(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			this._handleFileUploadClick();
		}
	}
	private _handleDeleteRow(event: CustomEvent) {
		const attachment = event.detail;
		this.attachments = this.attachments.filter(att => att.id !== attachment.id);
		this._updateService();
		this.requestUpdate();
		this.dispatchEvent(new CustomEvent("attachment-removed", { detail: attachment }));
	}

	// --- BUSINESS LOGIC ---
	private _updateService() {
		this.estimateService.updateField("attachments", this.attachments);
	}
	private _isDuplicateAttachment(attachment: AttachmentFile): boolean {
		if (attachment.isLink) return this.attachments.some(att => att.isLink && att.url === attachment.url);
		if (attachment.name && attachment.size)
			return this.attachments.some(att => !att.isLink && att.name === attachment.name && att.size === attachment.size);
		return false;
	}
	private _showError(message: string) {
		console.error(message);
		alertService?.showErrorAlert(message);
	}

	private _addCurrentAttachment() {
		this.currentAttachment.category = this.selectedCategoryKey || this.currentAttachment.category;
		this.currentAttachment.name = this.selectedTitle || this.currentAttachment.name;
		if (!this.currentAttachment) {
			alertService.showDetailedOkErrorAlert("Attachment Error", "No attachment data available to add.");
			return;
		}
		this.currentAttachment.created = new Date();
		this.currentAttachment.createdBy = this.userService.getCurrentUser()?.slid || "Unknown User";
		const errors = AttachmentFile.extractSubmitErrorsWith(this.currentAttachment);
		if (errors.length > 0) {
			const errorMessage = formatErrorsMessage(errors);
			alertService.showDetailedOkErrorAlert("Attachment Error", errorMessage);
			return;
		}
		if (this._isDuplicateAttachment(this.currentAttachment)) {
			const type = this.currentAttachment.isLink ? "link" : "file";
			this._showError(`This ${type} has already been added.`);
			return;
		}
		this.attachments = [...this.attachments, structuredClone(this.currentAttachment)];
		this._updateService();
		this._resetCurrentAttachment(true);
		this.requestUpdate();
		alertService?.showSuccessAlert("Attachment added successfully!");
	}

	// --- RENDER HELPERS ---
	private get acceptedExtensions(): string {
		return ALLOWED_EXTENSIONS.join(",");
	}
	private get rowData() {
		return this.attachments.map(att => ({ ...att, attachment: att }));
	}
	private get gridColumnDefs() {
		return [
			{
				headerName: "Title",
				field: "name",
				sortable: true,
				filter: true,
				width: 180,
				cellRenderer: (params: any) =>
					`<div class="display-name-cell">${params.data.name || "Unknown"}</div>`,
			},
			{
				headerName: "Category",
				field: "category",
				sortable: true,
				filter: true,
				width: 120,
				cellRenderer: (params: any) =>
					`<span class="category-badge">${params.data.category || "Uncategorized"}</span>`,
			},
			{
				headerName: "Type",
				field: "name",
				sortable: true,
				filter: true,
				width: 80,
				cellRenderer: (params: any) => {
					const icon = this._getAttachmentIcon(params.data.attachment);
					const typeName = params.data.isLink ? "Link" : "File";
					return `<div class="display-name-cell"><mdui-icon name="${icon}"></mdui-icon>${typeName}</div>`;
				},
			},
			{
				headerName: "Size",
				field: "size",
				sortable: true,
				filter: true,
				width: 100,
				cellRenderer: (params: any) =>
					params.data.size ? formatFileSize(params.data.size) : "—",
			},
		];
	}
	private _getAttachmentIcon(att: AttachmentFile): string {
		if (att?.isLink) return "link";
		const name = att?.name || "";
		if (name.match(/\.pdf$/i)) return "picture_as_pdf";
		if (name.match(/\.xlsx?$/i)) return "table_chart";
		if (name.match(/\.docx?$/i)) return "description";
		if (name.match(/\.(jpg|jpeg|png|gif)$/i)) return "image";
		return "attach_file";
	}

	// --- TEMPLATES ---
	override render() {
		return html`
			<section aria-label="Attachments Picker">
				<div class="attachments-container">
					<div class="form-row">
						${this.shouldShowSubjectSelect ? this._renderSubjectSelect() : nothing}
						${this.shouldShowSubjectIdInput ? this._renderSubjectId() : nothing}
					</div>
					<div class="attachment-mode-selector">
						<mdui-tabs variant="secondary" placement="top-start" aria-label="Attachment Mode" @change=${this._handleTabChange}>
							<mdui-tab value="file" inline icon="upload_file" id="tab-file" aria-controls="tabpanel-file">File</mdui-tab>
							<mdui-tab value="link" inline icon="link" id="tab-link" aria-controls="tabpanel-link">Link</mdui-tab>
							<mdui-tab-panel slot="panel" value="file" id="tabpanel-file" role="tabpanel" aria-labelledby="tab-file">
								<div class="add-attachment-content">${this._renderFileUploadForm()}</div>
							</mdui-tab-panel>
							<mdui-tab-panel slot="panel" value="link" id="tabpanel-link" role="tabpanel" aria-labelledby="tab-link">
								<div class="add-attachment-content">${this._renderLinkForm()}</div>
							</mdui-tab-panel>
						</mdui-tabs>
						<div class="form-row">
							<mdui-button color="secondary" @click=${() => this._addCurrentAttachment()} variant="tonal">
								Add Attachment
							</mdui-button>
						</div>
					</div>
					${this.shouldShowSelectedAttachmentsTable ? this._renderAttachmentsTable() : nothing}
					${this.shouldShowSubmitAttachmentsButton ? this._renderSubmitAttachmentsButton() : nothing}
				</div>
			</section>
		`;
	}

	private _renderFileUploadForm() {
		return html`
			<div class="file-upload-form">
				<div class="form-row">${this.shouldShowTitleInput ? this._renderTitleField() : nothing} ${this.shouldShowCategorySelect ? this._renderCategorySelect() : nothing}</div>
				<div class="form-row dropzone">${this._renderDropZone()}</div>
			</div>
		`;
	}
	private _renderTitleField() {
		return html`
			<div class="form-item">
				<mdui-text-field
					clearable
					label="Title"
					.value=${this.selectedTitle || this.currentAttachment.name || ""}
					placeholder="Custom title for uploaded files"
					@input=${this._handleFileTitleChange}
				></mdui-text-field>
			</div>
		`;
	}
	private _renderCategorySelect() {
		return html`
			<div class="form-item">
				<mdui-select
					label="Category"
					.value=${this.selectedCategoryKey || this.currentAttachment.category || ""}
					@change=${this._handleCategoryChange}
					required
					placement="bottom"
					aria-describedby="file-category-help"
				>
					<mdui-menu-item value="">Select category</mdui-menu-item>
					${this.categoryOptions.map(
						(cat) => html`<mdui-menu-item value=${cat.key}>${cat.title}</mdui-menu-item>`
					)}
					<mdui-button-icon slot="end-icon" icon="arrow_drop_down"></mdui-button-icon>
				</mdui-select>
			</div>
		`;
	}
	private _renderLinkForm() {
		return html`
			<div class="form-row">${this.shouldShowTitleInput ? this._renderTitleField() : nothing}${this.shouldShowCategorySelect ? this._renderCategorySelect() : nothing}</div>
			<div class="form-row">${this._renderLinkUrlField()}</div>
		`;
	}
	private _renderLinkUrlField() {
		return html`
			<div class="form-item">
				<mdui-text-field
					label="Link URL"
					.value=${this.currentAttachment.url || ""}
					placeholder="https://example.com/resource"
					type="url"
					inputmode="url"
					@input=${(e: InputEvent) => (this.currentAttachment.url = (e.target as HTMLInputElement).value)}
				></mdui-text-field>
			</div>
		`;
	}
	private _renderDropZone() {
		return html`
			<div
				class="drop-zone"
				aria-label="File upload area"
				@click=${this._handleFileUploadClick}
				@dragover=${(e: DragEvent) => e.preventDefault()}
				@drop=${(e: DragEvent) => {
					e.preventDefault();
					const files = e.dataTransfer?.files;
					if (files && files.length > 0) {
						this.currentAttachment.file = files[0];
						this.currentAttachment.size = files[0].size;
					}
				}}
				role="button"
				@keydown=${this._handleKeyUploadClick}
			>
				<mdui-icon name=${this.isLinkMode ? "link" : "upload"}></mdui-icon>
				<p class="file-types-hint">Accepted: ${this.acceptedExtensions}</p>
				<mdui-button variant="tonal">Browse Files</mdui-button>
				<input id="file-input" type="file" accept=${this.acceptedExtensions} @change=${this._handleFileUpload} hidden />
			</div>
		`;
	}
	private _renderSubmitAttachmentsButton() {
		const isEnabled = this.attachments.length > 0;
		let buttonTitle = "Submit Attachment";
		if (this.attachments.length > 1) buttonTitle = `Submit (${this.attachments.length}) Attachments`;
		return html`
			<div style="display:flex;justify-content: flex-end;margin-bottom: 10px;">
				<mdui-button raised ?disabled=${!isEnabled} color="secondary" @click=${this.handleSubmitAttachments}>
