import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDeleteDialogComponent } from './confirm-delete-dialog.component';

export interface ExpenseItem {
  date: string;
  description: string;
  amount: number | null;
}

export interface FormRecord {
  _id?: string;
  f_date: string;
  f_reqno: string;
  f_purpose: string;
  c_evang: boolean;
  c_form: boolean;
  c_church_donation: boolean;
  c_miss: boolean;
  c_priest_stipend: boolean;
  c_bereavement: boolean;
  c_natl_remittance: boolean;
  c_other: boolean;
  c_gov?: boolean;
  f_other_spec: string;
  f_payee: string;
  f_reqby: string;
  f_addr1: string;
  f_city: string;
  f_state: string;
  f_zip: string;
  f_activity: string;
  f_location: string;
  cash_advance: number | null;
  approver1_name: string;
  approver1_date: string;
  approver2_name: string;
  approver2_date: string;
  acc_received: string;
  acc_check: string;
  acc_mailed: string;
  acc_remarks: string;
  items: ExpenseItem[];
  total_expenses: string;
  amount_due: string;
}

interface DialogData {
  apiBaseUrl: string;
  mode: 'load' | 'print';
}

@Component({
  selector: 'app-payee-search-dialog',
  templateUrl: './payee-search-dialog.component.html',
  styleUrls: ['./payee-search-dialog.component.css'],
})
export class PayeeSearchDialogComponent {
  query = '';
  loading = false;
  searched = false;
  records: FormRecord[] = [];
  deletingIds = new Set<string>();

  constructor(
    private readonly http: HttpClient,
    private readonly dialog: MatDialog,
    private readonly dialogRef: MatDialogRef<PayeeSearchDialogComponent, FormRecord | undefined>,
    @Inject(MAT_DIALOG_DATA) public readonly data: DialogData,
  ) {}

  get title(): string {
    return this.data.mode === 'print' ? 'Search payee to print' : 'Search payee to load';
  }

  search(): void {
    this.loading = true;
    this.searched = true;

    let params = new HttpParams();
    if (this.query.trim()) {
      params = params.set('payee', this.query.trim());
    }

    this.http
      .get<FormRecord[]>(`${this.data.apiBaseUrl}/search`, { params })
      .subscribe({
        next: (records) => {
          this.records = records;
          this.loading = false;
        },
        error: () => {
          this.records = [];
          this.loading = false;
        },
      });
  }

  selectRecord(record: FormRecord): void {
    this.dialogRef.close(record);
  }

  deleteRecord(record: FormRecord): void {
    const recordId = record._id;
    if (!recordId) {
      return;
    }

    const confirmRef = this.dialog.open(ConfirmDeleteDialogComponent, {
      width: '420px',
      data: { payee: record.f_payee, requestNumber: record.f_reqno },
    });

    confirmRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.deletingIds.add(recordId);

      this.http.delete<{ deleted: boolean }>(`${this.data.apiBaseUrl}/${recordId}`).subscribe({
        next: () => {
          this.deletingIds.delete(recordId);
          this.search();
        },
        error: () => {
          this.deletingIds.delete(recordId);
        },
      });
    });
  }
}
