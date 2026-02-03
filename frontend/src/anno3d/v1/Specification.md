# !!! DEPRECATED !!!

This is an old and informal description of the first version of the annotation file format.

---

Annotations can be exported resulting in a file using the following simple text based file format.

Example:

```
format UTF8
version 1.0
count 10
label 0 3
0
1
2
label 1 1
5
label 2 0
```

Each file starts with two lines describing the format and version of the file format for future extensibility. The following line contains the total number of points of the point cloud or the number of triangles of the mesh. Finally all labels and their associated indices of the points/triangles are listed. Each label starts with the keyword label, followed by the labels annotation class and the number of associated points/triangles on the same line separated by spaces. Each associated index of a point/triangle of that label is then listed on a single line.
