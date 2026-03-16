package com.whs.bachelorarbeit.repository;

import com.whs.bachelorarbeit.entity.DistrictUnemployment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface DistrictUnemploymentRepository extends JpaRepository<DistrictUnemployment, Long> {

    @Query("select distinct d.stichtag from DistrictUnemployment d order by d.stichtag desc")
    List<LocalDate> findAllStichtage();

    List<DistrictUnemployment> findByStichtag(LocalDate stichtag);

}
