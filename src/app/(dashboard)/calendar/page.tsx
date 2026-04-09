"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function extractProperty(page: any, name: string): string {
  const prop = page.properties[name];
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.[0]?.plain_text || "";
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "date") return prop.date?.start || "";
  return "";
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  useEffect(() => {
    fetch("/api/tasks").then((r) => r.json()).then(setTasks);
  }, [year, month]);

  const tasksByDate = new Map<string, any[]>();
  for (const task of tasks) {
    const date = extractProperty(task, "작업일");
    if (!tasksByDate.has(date)) tasksByDate.set(date, []);
    tasksByDate.get(date)!.push(task);
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div>
      <Header title="캘린더" description="날짜별 수행 태스크를 확인합니다" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={prevMonth}>&lt; 이전</Button>
            <h2 className="text-lg font-semibold">
              {year}년 {month + 1}월
            </h2>
            <Button variant="ghost" onClick={nextMonth}>다음 &gt;</Button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {weekDays.map((day) => (
              <div key={day} className="bg-gray-50 p-2 text-center text-xs font-medium text-gray-500">
                {day}
              </div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-white p-2 min-h-[100px]" />
            ))}

            {days.map((day) => {
              const dateStr = formatDate(day);
              const dayTasks = tasksByDate.get(dateStr) || [];
              const isToday = dateStr === formatDate(new Date());
              const isSelected = dateStr === selectedDate;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`bg-white p-2 min-h-[100px] cursor-pointer transition-colors hover:bg-blue-50 ${
                    isSelected ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  <span className={`text-sm font-medium ${isToday ? "bg-blue-600 text-white rounded-full w-6 h-6 inline-flex items-center justify-center" : "text-gray-700"}`}>
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayTasks.slice(0, 3).map((t: any) => (
                      <div key={t.id} className="text-xs truncate text-gray-600 bg-blue-50 rounded px-1 py-0.5">
                        {extractProperty(t, "제목")}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-xs text-gray-400">+{dayTasks.length - 3}개 더</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDate && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-3">{selectedDate} 태스크</h3>
            {(tasksByDate.get(selectedDate) || []).length === 0 ? (
              <p className="text-sm text-gray-500">이 날짜에 기록된 태스크가 없습니다</p>
            ) : (
              <div className="space-y-3">
                {(tasksByDate.get(selectedDate) || []).map((t: any) => (
                  <div key={t.id} className="border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{extractProperty(t, "제목")}</span>
                      <Badge variant="secondary">{extractProperty(t, "프로젝트")}</Badge>
                      <Badge>{extractProperty(t, "작업 복잡도")}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{extractProperty(t, "작업 설명")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
