private syncAttachmentWithPickerState() {
    // This ensures autopopulated picker UI values are on the actual attachment object
    if (this.selectedCategoryKey) {
        this.currentAttachment.category = this.selectedCategoryKey;
    }
    if (this.selectedTitle) {
        this.currentAttachment.name = this.selectedTitle;
    }
    // Do the same for subject, if you want to persist that too
}

// Lit framework imports
import { consume } from "@lit/context";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
// MDUI component imports
import "mdui/components/button.js";
import "mdui/components/icon.js";

import "mdui/components/menu-item.js";
import "mdui/components/select.js";
import type { Select } from "mdui/components/select.js";
import "mdui/components/tab-panel.js";
import "mdui/components/tab.js";
import "mdui/components/tabs.js";
import "mdui/components/text-field.js";
import "../../../shared/newt-grid.js";
import "../../../shared/newt-user-clickable.js";

// Internal
import { NewtElement } from "../../../NewtElement.js";
import "./er-attachments-info-table.js";

// External library imports
import type { Subscription } from "rxjs";

// Internal service imports
import {
	EstimateRequestAppService,
	estimateRequestAppServiceContext,
} from "../../../../services/estimateRequestAppService.js";
import {
	UserService,
	userServiceContext,
} from "../../../../services/userService.js";

// Model imports
import { AttachmentFile } from "../../../../shared/models/estimate-request.js";
// Styles
import { attachmentsInfoPickerStyles } from "./attachments-style.js";

// Utility imports
import { alertService } from "../../../../services/index.js";
import { formatErrorsMessage } from "../../../../utils/commonUtils.js";
import { ALLOWED_EXTENSIONS, formatFileSize } from "../../utils/file-utils.js";
export class SelectOption {
	key!: string;
	title!: string;
	description?: string;
}

/**
 * Component for selecting and displaying attachments related to an estimate request.
 * @element attachments-info-picker
 * @fires file-uploaded - When files are uploaded
 * @fires attachment-removed - When an attachment is removed
 * @fires attachment-info-changed - When attachment info changes
 */
@customElement("attachments-info-picker")
export class AttachmentsInfoPicker extends NewtElement {
	public static override readonly styles = NewtElement.combineStyles(
		attachmentsInfoPickerStyles,
	);
	@consume({ context: estimateRequestAppServiceContext, subscribe: true })
	private readonly estimateService!: EstimateRequestAppService;

	@consume({ context: userServiceContext, subscribe: true })
	private readonly userService!: UserService;

	@property({ type: Array })
	attachment: AttachmentFile[] = [];

	/** Layout configuration */
	@property({ type: String })
	columnLayout: "one-column" | "two-column" = "two-column";

	/** Loading state */
	@state()
	private isUploading = false;

	@property({ type: Array })
	public selectOption: SelectOption[] = [];

	@property({ type: Boolean })
	public shouldShowSubjectSelect = false;

	@property({ type: Boolean })
	public shouldShowSubjectIdInput = false;

	@property({ type: Boolean })
	public shouldShowTitleInput = false;

	@property({ type: Boolean })
	public shouldShowCategorySelect = false;

	@property({ type: Boolean })
	public shouldShowSelectedAttachmentsTable = false;

	@property({ type: Boolean })
	public shouldShowSubmitAttachmentsButton = false;

	/** Subject options for the picker */
	@property({ type: Array })
	public subjectOptions: SelectOption[] = [];

	@property({ type: Array })
	public categoryOptions: SelectOption[] = [];

	@property({ type: String })
	public selectedSubjectKey: string = "";

	@property({ type: String })
	public selectedSubjectId: string = "";

	@property({ type: String })
	public selectedTitle: string = "";

	@property({ type: String })
	public selectedCategoryKey: string = "";

	/** For testing */
	private setUpAttachmentPicker() {
		// Set initial values for the picker
		this.selectedSubjectKey = "ESTIMATE_REQUEST";
		this.selectedSubjectId = "1";
		this.selectedCategoryKey = "TECHNICAL_DRAWINGS";
		this.selectedTitle = "New Project Estimate Request";

		//
		this.shouldShowSubjectSelect = true;
		this.shouldShowSubjectIdInput = true;
		this.shouldShowTitleInput = true;
		this.shouldShowCategorySelect = true;
		this.shouldShowSelectedAttachmentsTable = true;
		this.shouldShowSubmitAttachmentsButton = true;
		this.subjectOptions = [
			{
				key: "ESTIMATE_REQUEST",
				title: "Estimate Request",
				description: "New Project Estimate Request",
			},
			{
				key: "USER",
				title: "User",
				description: "Description for the second option.",
			},
			{
				key: "APP_LINKS",
				title: "Application Links",
			},
		];
		this.categoryOptions = [
			{
				key: "TECHNICAL_DRAWINGS",
				title: "Technical Drawings",
			},
			{
				key: "SPECIFICATIONS",
				title: "Specifications",
			},
			{
				key: "PHOTOS",
				title: "Photos",
			},
			{
				key: "REPORTS",
				title: "Reports",
			},
			{
				key: "CONTRACTS",
				title: "Contracts",
			},
			{
				key: "OTHER",
				title: "Other",
			},
		];
	}

	/** Add attachment file or link to be added to the error array */
	@state()
	private stagedAttachments: AttachmentFile[] = [];

	/** Current attachment being configured */
	@state()
	private currentAttachment: AttachmentFile = new AttachmentFile();

	@property({ type: Boolean })
	showActions = true;
	/** Attachments state - work directly with AttachmentFile objects */
	@property({ type: Array }) private attachments: AttachmentFile[] = [];

	/** Toggle between file upload and link input */
	@state() private isLinkMode = false;

	/** File input element reference */
	@query("#file-input")
	private readonly fileInput!: HTMLInputElement;

	@query("mdui-select")
	private readonly selectEl!: Select;
	/** Subscription to estimate request changes */
	private estimateRequestSubscription: Subscription | null = null;

	/**
	 * NEW: Sync autopopulated picker fields into currentAttachment for validation
	 */
	private syncAttachmentWithPickerState() {
		if (this.selectedCategoryKey) {
			this.currentAttachment.category = this.selectedCategoryKey;
		}
		if (this.selectedTitle) {
			this.currentAttachment.name = this.selectedTitle;
		}
	}

	private handleCategoryChange(e: Event): void {
		const target = e.target as HTMLSelectElement;
		const newValue = target.value;
		if (newValue) {
			this.selectedCategoryKey = newValue;
			this.currentAttachment.category = newValue;
		}
		if (this.currentAttachment.category) {
			this.shouldShowCategorySelect = true;
		}
	}

	override connectedCallback(): void {
		super.connectedCallback();

		try {
			this.initializeAttachmentsInfo();
		} catch (error) {
			console.error("Error initializing AttachmentsInfoPicker:", error);
			alertService?.showErrorAlert("Failed to initialize file uploads");
		}
		this.setUpAttachmentPicker();
		this.updateComplete.then(() => {
			const tabsElement = this.shadowRoot?.querySelector("mdui-tabs") as any;
			if (tabsElement && !tabsElement.value) {
				tabsElement.value = "file";
			}
		});
	}
	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.estimateRequestSubscription?.unsubscribe();
		this.estimateRequestSubscription = null;
	}

	private initializeAttachmentsInfo(): void {
		this.resetCurrentAttachment();
	}

	private isDuplicateAttachment(attachment: AttachmentFile): boolean {
		if (attachment.isLink) {
			return this.attachments.some(
				(att) => att.isLink && att.url === attachment.url,
			);
		} else if (attachment.name && attachment.size) {
			return this.attachments.some(
				(att) =>
					!att.isLink &&
					att.name === attachment.name &&
					att.size === attachment.size,
			);
		}
		return false;
	}

	private resetCurrentAttachment(refreshUI: boolean = false): void {
		this.currentAttachment = new AttachmentFile();
		this.currentAttachment.isLink = this.isLinkMode;
		if (refreshUI) {
			this.requestUpdate();
		}
	}

	private resetUISelections(): void {
		const activePanel = this.shadowRoot?.querySelector(
			`mdui-tab-panel[value="${this.isLinkMode ? "link" : "file"}"]`,
		);
		if (activePanel) {
			const textFields = activePanel.querySelectorAll("mdui-text-field");
			textFields.forEach((field: any) => {
				field.value = "";
				field.error = false;
			});
			const selectElements = activePanel.querySelectorAll("mdui-select");
			selectElements.forEach((select: any) => {
				select.value = "";
			});
		}
		if (this.fileInput) {
			this.fileInput.value = "";
		}
		this.clearValidationState();
		this.requestUpdate();
	}

	private clearValidationState(): void {
		const formElements = this.shadowRoot?.querySelectorAll(
			"mdui-text-field, mdui-select",
		);
		formElements?.forEach((element: any) => {
			if (element.setCustomValidity) {
				element.setCustomValidity("");
			}
			if (element.reportValidity) {
				element.reportValidity();
			}
			element.error = false;
		});
	}

	private handleTabChange(e: CustomEvent): void {
		if (!(e.target instanceof Element) || e.target.tagName !== "MDUI-TABS") {
			console.log("🚫 Event not from tabs - ignoring");
			return;
		}
		const tabsElement = e.target as any;
		const activeTab = tabsElement.querySelector("mdui-tab[active]");
		const tabValue = activeTab?.value;
		if (!tabValue) {
			console.warn("⚠️ Tab value is undefined - skipping update");
			return;
		}
		const newIsLinkMode = tabValue === "link";
		if (this.isLinkMode !== newIsLinkMode) {
			console.log(
				`✅ Tab mode changing from ${this.isLinkMode} to ${newIsLinkMode}`,
			);
			this.isLinkMode = newIsLinkMode;
			this.resetCurrentAttachment();
			this.currentAttachment.isLink = this.isLinkMode;
		}
	}

	public clearAll(): void {
		this.attachments = [];
		this.updateService();
	}

	private get acceptedExtensions(): string {
		return ALLOWED_EXTENSIONS.join(",");
	}

	private handleKeyUploadClick(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			this.handleFileUploadClick();
		}
	}

	private addCurrentAttachment(): void {
		this.syncAttachmentWithPickerState(); // <<--- THE MAGIC

		if (!this.currentAttachment) {
			alertService.showDetailedOkErrorAlert(
				"Attachment Error",
				"No attachment data available to add.",
			);
			return;
		}

		this.currentAttachment.created = new Date();
		this.currentAttachment.createdBy =
			this.userService.getCurrentUser()?.slid || "Unknown User";

		const errors = AttachmentFile.extractSubmitErrorsWith(this.currentAttachment);
		if (errors.length > 0) {
			const errorMessage = formatErrorsMessage(errors);
			alertService.showDetailedOkErrorAlert("Attachment Error", errorMessage);
			return;
		}

		if (this.isDuplicateAttachment(this.currentAttachment)) {
			const type = this.currentAttachment.isLink ? "link" : "file";
			this.showError(`This ${type} has already been added.`);
			return;
		}
		this.attachments = [
			...this.attachments,
			structuredClone(this.currentAttachment),
		];

		this.updateService();
		this.resetCurrentAttachment(true);
		this.resetUISelections();
		alertService?.showSuccessAlert("Attachment added successfully!");
	}

	private getAttachmentIcon(attachment: AttachmentFile): string {
		if (attachment?.isLink) return "link";
		const name = attachment?.name || "";
		if (name.includes(".pdf")) return "picture_as_pdf";
		if (name.includes(".xlsx") || name.includes(".xls")) return "table_chart";
		if (name.includes(".doc")) return "description";
		if (name.includes(".jpg") || name.includes(".png")) return "image";
		return "attach_file";
	}

	override render() {
		return html`
			<div class="attachments-container">
				<div class="form-row">
					${this.renderSubjectSelect()} ${this.renderSubjectId()}
				</div>
				<div class="attachment-mode-selector">
					<mdui-tabs
						variant="secondary"
						placement="top-start"
						@change=${this.handleTabChange}
					>
						<mdui-tab value="file" inline icon="upload_file">File</mdui-tab>
						<mdui-tab value="link" inline icon="link">Link</mdui-tab>
						<mdui-tab-panel slot="panel" value="file">
							<div class="add-attachment-content">
								${this.renderFileUploadForm()}
							</div>
						</mdui-tab-panel>
						<mdui-tab-panel slot="panel" value="link">
							<div class="add-attachment-content">${this.renderLinkForm()}</div>
						</mdui-tab-panel>
					</mdui-tabs>
					<div class="form-row">
						<mdui-button
							color="secondary"
							@click=${this.addCurrentAttachment}
							variant="tonal"
						>
							Add Attachment
						</mdui-button>
					</div>
				</div>
				${this.displayAttachmentsTable()}
				${this.renderSubmitAttachmentsButton()}
			</div>
		`
