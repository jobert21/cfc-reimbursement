import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, Inject, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort, Sort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

export interface ReimbursementRecord {
  _id: string;
  f_date: string;
  f_reqno: string;
  f_payee: string;
  f_reqby: string;
  total_expenses: string;
  amount_due: string;
  updatedAt: string;
}

interface DialogData {
  apiBaseUrl: string;
}

@Component({
  selector: 'app-reimbursement-list-dialog',
  templateUrl: './reimbursement-list-dialog.component.html',
  styleUrls: ['./reimbursement-list-dialog.component.css'],
})
export class ReimbursementListDialogComponent implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['f_reqno', 'f_date', 'f_payee', 'f_reqby', 'total_expenses', 'amount_due', 'actions'];
  dataSource = new MatTableDataSource<ReimbursementRecord>([]);

  searchPayee = '';
  loading = false;
  totalCount = 0;
  pageSize = 10;
  pageIndex = 0;

  sortColumn = 'updatedAt';
  sortDirection: 'asc' | 'desc' = 'desc';

  deletingIds = new Set<string>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private readonly http: HttpClient,
    private readonly dialogRef: MatDialogRef<ReimbursementListDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: DialogData,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngAfterViewInit(): void {
    this.sort.sortChange.subscribe((sortEvent: Sort) => {
      this.sortColumn = sortEvent.active || 'updatedAt';
      this.sortDirection = sortEvent.direction || 'desc';
      this.pageIndex = 0;
      this.loadData();
    });
  }

  search(): void {
    this.pageIndex = 0;
    this.loadData();
  }

  clearSearch(): void {
    this.searchPayee = '';
    this.pageIndex = 0;
    this.loadData();
  }

  loadData(): void {
    this.loading = true;

    let params = new HttpParams()
      .set('page', String(this.pageIndex + 1))
      .set('limit', String(this.pageSize))
      .set('sortBy', this.sortColumn)
      .set('sortOrder', this.sortDirection);

    if (this.searchPayee && this.searchPayee.trim()) {
      params = params.set('payee', this.searchPayee.trim());
    }

    this.http
      .get<{ count: number; docs: ReimbursementRecord[] }>(`${this.data.apiBaseUrl.replace('/forms', '')}/forms/list`, { params })
      .subscribe({
        next: (response) => {
          this.dataSource.data = response.docs;
          this.totalCount = response.count;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  deleteRecord(record: ReimbursementRecord): void {
    if (!confirm(`Delete record ${record.f_reqno || record.f_payee}?`)) {
      return;
    }

    this.deletingIds.add(record._id);

    this.http
      .delete<{ deleted: boolean }>(`${this.data.apiBaseUrl}/${record._id}`)
      .subscribe({
        next: () => {
          this.deletingIds.delete(record._id);
          this.loadData();
        },
        error: () => {
          this.deletingIds.delete(record._id);
        },
      });
  }

  selectRecord(record: ReimbursementRecord): void {
    this.dialogRef.close(record);
  }
}